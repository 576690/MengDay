import { describe, it, expect } from 'vitest';
import {
  initialData,
  toggleTimer,
  ensureActivity,
  suggest,
  saveEntry,
  validateData,
  dayBounds,
  totals,
  rangeDays,
  shiftMonth,
  backup,
  parseBackup,
  mergeData,
  csv,
  uid,
} from '../src/model';
describe('single timer and notes', () => {
  it('explicit start creates a fresh segment even for the same activity', () => {
    const d = initialData();
    toggleTimer(d, '工作', 1000, '第一段');
    toggleTimer(d, '工作', 62000, '第二段', 'start');
    expect(d.entries).toHaveLength(2);
    expect(d.entries[0].end).toBe(62000);
    expect(d.entries[1].note).toBe('第二段');
  });
  it('switches atomically and never inherits notes', () => {
    const d = initialData();
    toggleTimer(d, '工作', 1000, '写方案\n下一步：采访');
    toggleTimer(d, '学习', 65000);
    expect(d.entries[0]).toMatchObject({ start: 1000, end: 65000, note: '写方案\n下一步：采访' });
    expect(d.entries[1]).toMatchObject({ start: 65000, end: null, note: '' });
    toggleTimer(d, '学习', 130000);
    expect(d.entries.every((e) => e.end !== null)).toBe(true);
    toggleTimer(d, '工作', 131000);
    expect(d.entries[2].note).toBe('');
  });
  it('rejects overlapping edits, duplicate IDs and multiple running timers', () => {
    const d = initialData();
    toggleTimer(d, '工作', 1000);
    toggleTimer(d, '工作', 65000);
    expect(() =>
      saveEntry(d, {
        id: uid(),
        activityId: d.activities[0].id,
        start: 64000,
        end: 69000,
        note: '',
      }),
    ).toThrow('重叠');
    const other = initialData();
    other.entries = [
      { id: uid(), activityId: other.activities[0].id, start: 1000, end: null, note: '' },
      { id: uid(), activityId: other.activities[1].id, start: 62000, end: null, note: '' },
    ];
    expect(() => validateData(other)).toThrow('只能');
  });
  it('allows adjacent entries and persists multiline Unicode notes', () => {
    const d = initialData(),
      a = d.activities[0];
    saveEntry(d, {
      id: uid(),
      activityId: a.id,
      start: 1000,
      end: 2000,
      note: '认真一点\n💡 想法',
    });
    saveEntry(d, { id: uid(), activityId: a.id, start: 2000, end: 3000, note: '' });
    expect(parseBackup(backup(d))).toEqual(d);
  });
});
describe('activity name memory', () => {
  it('normalizes whitespace and casing without duplicating activities', () => {
    const d = initialData(),
      a = ensureActivity(d, '  Deep Work  '),
      b = ensureActivity(d, 'deep work');
    expect(a.id).toBe(b.id);
    expect(a.name).toBe('Deep Work');
    a.archived = true;
    expect(suggest(d.activities, 'deep')).toHaveLength(0);
    expect(ensureActivity(d, 'DEEP WORK').archived).toBe(false);
  });
  it('orders by exact match, prefix, substring, then last use', () => {
    const d = initialData();
    const a = ensureActivity(d, '读'),
      b = ensureActivity(d, '读书'),
      c = ensureActivity(d, '阅读笔记');
    a.lastUsed = 1;
    b.lastUsed = 3;
    c.lastUsed = 5;
    expect(
      suggest(d.activities, '读')
        .slice(0, 3)
        .map((a) => a.name),
    ).toEqual(['读', '读书', '阅读笔记']);
    expect(
      suggest(d.activities)
        .slice(0, 3)
        .map((a) => a.name),
    ).toEqual(['阅读笔记', '读书', '读']);
  });
});
describe('timezone and reports', () => {
  it('navigates calendar months without skipping February', () => {
    expect(shiftMonth('2026-03-01', -1)).toBe('2026-02-01');
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('splits one record across local midnight', () => {
    const d = initialData();
    d.entries = [
      {
        id: uid(),
        activityId: d.activities[0].id,
        start: Date.parse('2026-09-10T15:30:00Z'),
        end: Date.parse('2026-09-10T16:30:00Z'),
        note: '',
      },
    ];
    expect(totals(d, ['2026-09-10'])[0].ms).toBe(1800000);
    expect(totals(d, ['2026-09-11'])[0].ms).toBe(1800000);
  });
  it('handles daylight-saving day lengths and Monday weeks', () => {
    const [s, e] = dayBounds('2026-03-08', 'America/New_York');
    expect(e - s).toBe(23 * 3600000);
    expect(rangeDays('2026-09-13', 'week')[0]).toBe('2026-09-07');
    expect(rangeDays('2024-02-13', 'month')).toHaveLength(29);
  });
  it('uses current time for a running entry', () => {
    const d = initialData(),
      [s] = dayBounds('2026-09-11', 'Asia/Shanghai');
    toggleTimer(d, '学习', s);
    expect(totals(d, ['2026-09-11'], s + 3600000).find((t) => t.activity.name === '学习')?.ms).toBe(
      3600000,
    );
  });
});
describe('backup validation and merge', () => {
  it('merges different IDs and remaps same-name activities', () => {
    const a = initialData(),
      b = initialData();
    a.entries = [
      { id: uid(), activityId: a.activities[0].id, start: 1000, end: 2000, note: '本机' },
    ];
    b.entries = [
      { id: uid(), activityId: b.activities[0].id, start: 2000, end: 3000, note: '云端' },
    ];
    const merged = mergeData(a, b, 'local');
    expect(merged.activities).toHaveLength(6);
    expect(merged.entries).toHaveLength(2);
    expect(merged.entries[1].activityId).toBe(a.activities[0].id);
    expect(mergeData(merged, b, 'local').entries).toHaveLength(2);
  });
  it('requires a preference for same-ID content, prevents overlap', () => {
    const a = initialData();
    toggleTimer(a, '工作', 1000, 'A');
    toggleTimer(a, '工作', 62000);
    const b = structuredClone(a);
    b.entries[0].note = 'B';
    expect(mergeData(a, b, 'local').entries[0].note).toBe('A');
    expect(mergeData(a, b, 'incoming').entries[0].note).toBe('B');
    b.entries[0].id = uid();
    expect(() => mergeData(a, b, 'local')).toThrow('重叠');
  });
  it('rejects malformed, unsupported and unsafe imported data', () => {
    expect(() => parseBackup('abc')).toThrow();
    expect(() => parseBackup('{"version":2}')).toThrow();
    const d = initialData();
    d.entries = [{ id: uid(), activityId: 'missing', start: 1, end: 2, note: '' }];
    expect(() => parseBackup(backup(d))).toThrow();
    const invalid = initialData();
    invalid.activities[0].color = 'url(javascript:alert(1))';
    expect(() => validateData(invalid)).toThrow();
  });
  it('quotes CSV newlines, quotes and spreadsheet formula prefixes', () => {
    const d = initialData();
    d.activities[0].name = '=SUM(1,2)';
    d.entries = [
      {
        id: uid(),
        activityId: d.activities[0].id,
        start: 1000,
        end: 2000,
        note: '想法,"细节"\n下一行',
      },
    ];
    const result = csv(d);
    expect(result).toContain('"\'=SUM(1,2)"');
    expect(result).toContain('"想法,""细节""\n下一行"');
  });
});
