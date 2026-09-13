import { expect, it } from 'vitest';
import {
  initialData,
  toggleTimer,
  categoryTotals,
  dayBounds,
  saveEntry,
  uid,
  backup,
  parseBackup,
} from '../src/model';

it('discards only completed timers under 60 seconds and keeps activity memory', () => {
  const d = initialData();
  toggleTimer(d, '误触', 1000, '短备注');
  expect(toggleTimer(d, '误触', 60999).discarded).toBe(true);
  expect(d.entries).toHaveLength(0);
  const a = d.activities.find((a) => a.name === '误触')!;
  expect(a).toBeDefined();
  toggleTimer(d, '误触', 70000);
  expect(toggleTimer(d, '误触', 130000).discarded).toBe(false);
  expect(d.entries).toHaveLength(1);
  saveEntry(d, { id: uid(), activityId: a.id, start: 1, end: 100, note: '主动补录' });
  expect(parseBackup(backup(d))).toEqual(d);
});

it('switch and explicit restart discard short segments without inheriting notes', () => {
  const d = initialData();
  toggleTimer(d, 'A', 1000, '旧备注');
  expect(toggleTimer(d, 'B', 2000).discarded).toBe(true);
  expect(d.entries).toHaveLength(1);
  expect(d.entries[0].note).toBe('');
  expect(toggleTimer(d, 'B', 3000, '新备注', 'start').discarded).toBe(true);
  expect(d.entries).toHaveLength(1);
  expect(d.entries[0]).toMatchObject({ start: 3000, end: null, note: '新备注' });
});

it('category totals merge trimmed names, keep archived history and follow category changes', () => {
  const d = initialData(),
    day = '2026-09-10',
    s = dayBounds(day, d.settings.timezone)[0];
  d.activities[0].category = ' 工作 ';
  d.activities[1].category = '工作';
  d.activities[1].archived = true;
  d.activities[2].category = '  ';
  d.entries = d.activities.slice(0, 3).map((a, i) => ({
    id: uid(),
    activityId: a.id,
    start: s + i * 3600000,
    end: s + (i + 1) * 3600000,
    note: '',
  }));
  const groups = categoryTotals(d, [day], s + 86400000);
  expect(groups.map((g) => [g.name, g.ms])).toEqual([
    ['工作', 7200000],
    ['其他', 3600000],
  ]);
  expect(groups[0].activities).toHaveLength(2);
  const color = groups[0].color;
  d.activities[1].category = '其他';
  expect(categoryTotals(d, [day], s + 86400000).find((g) => g.name === '工作')?.color).toBe(color);
  d.settings.timezone = 'UTC';
  expect(categoryTotals(d, [day], s + 86400000)).toEqual([]);
});
