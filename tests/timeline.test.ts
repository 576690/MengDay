import { describe, it, expect } from 'vitest';
import { initialData, uid, dayBounds, validateData, backup, parseBackup } from '../src/model';
import { palette, iconNames } from '../src/appearance';
import {
  dayLayout,
  gapsForDay,
  fillGap,
  moveBoundary,
  boundaryLimits,
  snapBoundary,
  applyChange,
  createChange,
  deleteActivity,
  HOUR,
} from '../src/timeline-model';
const day = '2026-09-10',
  start = dayBounds(day, 'Asia/Shanghai')[0];
function fixture() {
  const d = initialData();
  d.entries = [
    {
      id: uid(),
      activityId: d.activities[0].id,
      start: start + 8 * HOUR,
      end: start + 9 * HOUR,
      note: '第一段',
    },
    {
      id: uid(),
      activityId: d.activities[1].id,
      start: start + 10 * HOUR,
      end: start + 11 * HOUR,
      note: '第二段',
    },
  ];
  return d;
}
describe('appearance and deletion', () => {
  it('offers 24 colors, 36 motifs and a solid option; round-trips backups', () => {
    expect(palette).toHaveLength(24);
    expect(iconNames.length).toBeGreaterThanOrEqual(33);
    const d = fixture();
    d.activities[0].icon = 'None';
    d.activities[0].color = '#123abc';
    expect(parseBackup(backup(d))).toEqual(d);
  });
  it('archives while preserving history, or deletes the full activity atomically', () => {
    const d = fixture(),
      id = d.activities[0].id;
    applyChange(d, deleteActivity(d, id, false));
    expect(d.activities[0].archived).toBe(true);
    expect(d.entries).toHaveLength(2);
    const change = deleteActivity(d, id, true);
    applyChange(d, change);
    expect(d.entries).toHaveLength(1);
    expect(d.activities.some((a) => a.id === id)).toBe(false);
    applyChange(d, change, true);
    expect(d.entries).toHaveLength(2);
  });
  it('refuses deletion of running activities and preserves unrelated changes on undo', () => {
    const d = fixture();
    d.entries[1].end = null;
    expect(() => deleteActivity(d, d.activities[1].id, true)).toThrow('计时');
    const change = deleteActivity(d, d.activities[0].id, true);
    applyChange(d, change);
    d.entries[0].note = '后来写的想法';
    applyChange(d, change, true);
    expect(d.entries.find((e) => e.end === null)?.note).toBe('后来写的想法');
  });
});
describe('proportional chronological calendar', () => {
  it('orders early to late and scales position and height without inflating short records', () => {
    const d = fixture();
    d.entries.reverse();
    let l = dayLayout(d, day, 64, start + 24 * HOUR);
    expect(l.blocks[0].top).toBe(512);
    expect(l.blocks[0].height).toBe(64);
    d.entries[0].end = d.entries[0].start + 30000;
    l = dayLayout(d, day, 64, start + 24 * HOUR);
    expect(l.blocks[1].height).toBeCloseTo(64 / 120);
  });
  it('splits a midnight record without duplicating or modifying its ID', () => {
    const d = fixture();
    d.entries = [{ ...d.entries[0], start: start - HOUR, end: start + HOUR }];
    const l = dayLayout(d, day, 64, start + 24 * HOUR);
    expect(l.blocks[0]).toMatchObject({ top: 0, height: 64, continuesBefore: true });
    expect(l.blocks[0].entry.id).toBe(d.entries[0].id);
  });
  it('lays out 23/25 hour DST dates in real chronological order', () => {
    const d = initialData();
    d.settings.timezone = 'America/New_York';
    expect(dayLayout(d, '2026-03-08', 64, Date.now()).hours).toBe(23);
    const l = dayLayout(d, '2026-11-01', 64, Date.now());
    expect(l.hours).toBe(25);
    const repeated = l.ticks.filter((t) => t.label === '01:00');
    expect(repeated).toHaveLength(2);
    expect(repeated[0].offset).not.toBe(repeated[1].offset);
    expect(repeated[1].y - repeated[0].y).toBe(64);
  });
});
describe('gap filling, boundaries and conflict-safe undo', () => {
  it('finds leading, middle and trailing gaps but none in the future', () => {
    const d = fixture();
    const gaps = gapsForDay(d, day, start + 12 * HOUR);
    expect(gaps).toHaveLength(3);
    expect(gaps[1].end - gaps[1].start).toBe(HOUR);
    expect(gaps[0].before).toBeUndefined();
    expect(gaps[2].after).toBeUndefined();
    expect(gapsForDay(d, '2026-09-11', start + 12 * HOUR)).toHaveLength(0);
  });
  it('fills a gap from either side, and a single undo restores the previous boundary', () => {
    for (const direction of ['before', 'after'] as const) {
      const d = fixture(),
        g = gapsForDay(d, day, start + 12 * HOUR)[1],
        change = fillGap(d, g, direction);
      applyChange(d, change);
      expect(d.entries[0].end).toBe(d.entries[1].start);
      applyChange(d, change, true);
      expect(d.entries[0].end).toBe(start + 9 * HOUR);
      expect(d.entries[1].start).toBe(start + 10 * HOUR);
    }
  });
  it('moves a shared boundary in one change without changing overall time', () => {
    const d = fixture();
    d.entries[1].start = d.entries[0].end!;
    const b = { id: d.entries[0].id, edge: 'end' as const, sharedId: d.entries[1].id };
    const change = moveBoundary(d, b, start + 9.5 * HOUR, start + 12 * HOUR);
    expect(change.entries).toHaveLength(2);
    applyChange(d, change);
    expect(d.entries[0].end).toBe(d.entries[1].start);
    expect(d.entries[1].end! - d.entries[0].start).toBe(3 * HOUR);
  });
  it('snaps exactly to an irregular neighboring timestamp before grid rounding', () => {
    const d = fixture();
    d.entries[1].start += 17000;
    const limits = boundaryLimits(d, { id: d.entries[0].id, edge: 'end' }, start + 12 * HOUR);
    expect(snapBoundary(d.entries[1].start - 60000, limits, 64, true, start)).toBe(
      d.entries[1].start,
    );
    expect(snapBoundary(start + 9.51 * HOUR, limits, 64, true, start)).toBe(start + 9.5 * HOUR);
    expect(snapBoundary(start + 9.51 * HOUR, limits, 64, false, start)).toBe(start + 9.51 * HOUR);
  });
  it('rejects overlap, empty intervals, changes to running ends and stale patches', () => {
    const d = fixture();
    expect(() =>
      moveBoundary(d, { id: d.entries[0].id, edge: 'end' }, start + 10.5 * HOUR, start + 12 * HOUR),
    ).toThrow();
    const change = moveBoundary(
      d,
      { id: d.entries[0].id, edge: 'end' },
      start + 9.5 * HOUR,
      start + 12 * HOUR,
    );
    d.entries[0].note = '来自另一个标签页';
    expect(() => applyChange(d, change)).toThrow('已被修改');
    d.entries[1].end = null;
    expect(() =>
      boundaryLimits(d, { id: d.entries[1].id, edge: 'end' }, start + 12 * HOUR),
    ).toThrow('运行中');
  });
  it('undo insertion cannot silently overwrite a later edit', () => {
    const d = fixture();
    const change = createChange(d, 'insert', (x) =>
      x.entries.push({
        id: uid(),
        activityId: x.activities[2].id,
        start: start + 9 * HOUR,
        end: start + 10 * HOUR,
        note: '新记录',
      }),
    );
    applyChange(d, change);
    d.entries[2].note = '后来编辑';
    expect(() => applyChange(d, change, true)).toThrow('已被修改');
    validateData(d);
  });
});
