import { formatInTimeZone } from 'date-fns-tz';
import { dayBounds, validateData, type Data, type Entry, type Activity } from './model';
export const HOUR = 3600000;
export type Change = {
  label: string;
  activities: { before?: Activity; after?: Activity }[];
  entries: { before?: Entry; after?: Entry }[];
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function createChange(data: Data, label: string, edit: (next: Data) => void): Change {
  const next = structuredClone(data);
  edit(next);
  validateData(next);
  const diff = <T extends { id: string }>(before: T[], after: T[]) => {
    const b = new Map(before.map((x) => [x.id, x])),
      a = new Map(after.map((x) => [x.id, x]));
    return [...new Set([...b.keys(), ...a.keys()])]
      .filter((id) => !same(b.get(id), a.get(id)))
      .map((id) => ({ before: b.get(id), after: a.get(id) }));
  };
  return structuredClone({
    label,
    activities: diff(data.activities, next.activities),
    entries: diff(data.entries, next.entries),
  });
}
export function applyChange(data: Data, change: Change, reverse = false) {
  const apply = <T extends { id: string }>(rows: T[], changes: { before?: T; after?: T }[]) => {
    const result = [...rows];
    for (const item of changes) {
      const before = reverse ? item.after : item.before,
        after = reverse ? item.before : item.after,
        id = (before ?? after)!.id,
        index = result.findIndex((x) => x.id === id);
      if (!same(index < 0 ? undefined : result[index], before))
        throw Error('相关记录已被修改，请重新操作');
      if (after) {
        if (index < 0) result.push(structuredClone(after));
        else result[index] = structuredClone(after);
      } else if (index >= 0) result.splice(index, 1);
    }
    return result;
  };
  const next = {
    ...data,
    activities: apply(data.activities, change.activities),
    entries: apply(data.entries, change.entries),
  };
  validateData(next);
  Object.assign(data, next);
}
export function deleteActivity(data: Data, id: string, all: boolean): Change {
  if (data.entries.some((e) => e.activityId === id && e.end === null))
    throw Error('请先结束该活动的计时');
  return createChange(data, all ? '已删除活动及记录' : '已移除活动，历史保留', (d) => {
    if (all) {
      d.activities = d.activities.filter((a) => a.id !== id);
      d.entries = d.entries.filter((e) => e.activityId !== id);
    } else d.activities.find((a) => a.id === id)!.archived = true;
  });
}
export function dayLayout(data: Data, day: string, scale: number, now: number) {
  const [start, end] = dayBounds(day, data.settings.timezone),
    hours = (end - start) / HOUR;
  return {
    start,
    end,
    hours,
    height: hours * scale,
    ticks: Array.from({ length: Math.ceil(hours) + 1 }, (_, i) => {
      const time = Math.min(end, start + i * HOUR);
      return {
        time,
        y: ((time - start) / HOUR) * scale,
        label: time === end ? '24:00' : formatInTimeZone(time, data.settings.timezone, 'HH:mm'),
        offset: formatInTimeZone(time, data.settings.timezone, 'XXX'),
      };
    }),
    blocks: data.entries
      .filter((e) => e.start < end && (e.end ?? now) > start)
      .sort((a, b) => a.start - b.start)
      .map((entry) => ({
        entry,
        top: ((Math.max(start, entry.start) - start) / HOUR) * scale,
        height: Math.max(
          0,
          ((Math.min(end, entry.end ?? now) - Math.max(start, entry.start)) / HOUR) * scale,
        ),
        continuesBefore: entry.start < start,
        continuesAfter: (entry.end ?? now) > end,
      })),
  };
}
export type Gap = { start: number; end: number; before?: Entry; after?: Entry };
export function gapsForDay(data: Data, day: string, now: number): Gap[] {
  const [start, end] = dayBounds(day, data.settings.timezone),
    limit = Math.min(end, now);
  if (limit <= start) return [];
  const sorted = [...data.entries].sort((a, b) => a.start - b.start);
  const gaps: Gap[] = [];
  let cursor = start;
  let before = sorted.filter((e) => e.end !== null && e.end <= start).at(-1);
  for (const e of sorted) {
    if ((e.end ?? Infinity) <= start) continue;
    if (e.start >= limit) {
      if (cursor < limit)
        gaps.push({
          start: cursor,
          end: limit,
          before: before?.end === cursor ? before : undefined,
          after: e.start === limit ? e : undefined,
        });
      return gaps;
    }
    if (e.start > cursor)
      gaps.push({
        start: cursor,
        end: e.start,
        before: before?.end === cursor ? before : undefined,
        after: e,
      });
    cursor = Math.max(cursor, Math.min(e.end ?? limit, limit));
    before = e;
    if (cursor >= limit) return gaps;
  }
  if (cursor < limit)
    gaps.push({ start: cursor, end: limit, before: before?.end === cursor ? before : undefined });
  return gaps;
}
export function fillGap(data: Data, gap: Gap, direction: 'before' | 'after'): Change {
  const entry = direction === 'before' ? gap.before : gap.after;
  if (!entry) throw Error('该侧没有可延伸的记录');
  const current = data.entries.find((e) => e.id === entry.id);
  if (!same(current, entry)) throw Error('相关记录已被修改，请重新选择空白');
  return createChange(data, '已填补空白', (d) => {
    const e = d.entries.find((e) => e.id === entry.id)!;
    if (direction === 'before') {
      if (e.end === null) throw Error('不能延长运行中的记录');
      e.end = gap.end;
    } else e.start = gap.start;
  });
}
export type Boundary = { id: string; edge: 'start' | 'end'; sharedId?: string };
export function boundaryLimits(data: Data, b: Boundary, now: number) {
  const list = [...data.entries].sort((a, b) => a.start - b.start),
    i = list.findIndex((e) => e.id === b.id),
    e = list[i];
  if (!e) throw Error('记录不存在');
  if (b.sharedId) {
    const next = list[i + 1];
    if (b.edge !== 'end' || e.end === null || next?.id !== b.sharedId || e.end !== next.start)
      throw Error('共同边界已改变');
    return { min: e.start + 1000, max: (next.end ?? now) - 1000, neighbors: [] as number[] };
  }
  if (b.edge === 'end') {
    if (e.end === null) throw Error('运行中记录不能拖动结束时间');
    return {
      min: e.start + 1000,
      max: Math.min(list[i + 1]?.start ?? now, now),
      neighbors: list[i + 1] ? [list[i + 1].start] : [],
    };
  }
  return {
    min: list[i - 1]?.end ?? 0,
    max: (e.end ?? now) - 1000,
    neighbors: list[i - 1]?.end !== null && list[i - 1] ? [list[i - 1].end!] : [],
  };
}
export function snapBoundary(
  raw: number,
  limits: ReturnType<typeof boundaryLimits>,
  scale: number,
  snap: boolean,
  origin = 0,
) {
  let time = Math.round(raw / 1000) * 1000;
  if (snap) {
    const neighbor = limits.neighbors.find((t) => (Math.abs(t - raw) / HOUR) * scale <= 8);
    time = neighbor ?? origin + Math.round((raw - origin) / 300000) * 300000;
  }
  return Math.max(limits.min, Math.min(limits.max, time));
}
export function moveBoundary(data: Data, b: Boundary, time: number, now: number): Change {
  const limits = boundaryLimits(data, b, now);
  if (time < limits.min || time > limits.max) throw Error('边界超出可调整范围');
  return createChange(data, b.sharedId ? '已调整共同边界' : '已调整记录边界', (d) => {
    const e = d.entries.find((e) => e.id === b.id)!;
    if (b.edge === 'start') e.start = time;
    else e.end = time;
    if (b.sharedId) d.entries.find((e) => e.id === b.sharedId)!.start = time;
  });
}
