import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { palette, iconNames } from './appearance';
import {
  addDays,
  addMonths,
  format,
  parseISO,
  startOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';

export type Activity = {
  id: string;
  name: string;
  color: string;
  icon: string;
  category: string;
  order: number;
  archived: boolean;
  lastUsed: number;
  goalMinutes: number;
  goalPeriod: 'day' | 'week';
};
export type Entry = {
  id: string;
  activityId: string;
  start: number;
  end: number | null;
  note: string;
};
export type Settings = { theme: 'light' | 'dark' | 'system'; timezone: string };
export type Data = { activities: Activity[]; entries: Entry[]; settings: Settings };
export const colors = palette;
export const icons = iconNames;
export const uid = () => crypto.randomUUID();
export const normalize = (s: string) => s.trim().toLowerCase();
export function initialData(): Data {
  const names = ['工作', '学习', '运动', '阅读', '休息', '生活'];
  return {
    activities: names.map((name, i) => ({
      id: uid(),
      name,
      color: colors[i],
      icon: ['BriefcaseBusiness', 'BookOpen', 'Dumbbell', 'Coffee', 'Moon', 'Heart'][i],
      category: ['工作', '成长', '健康', '成长', '生活', '生活'][i],
      order: i,
      archived: false,
      lastUsed: 0,
      goalMinutes: 0,
      goalPeriod: 'day',
    })),
    entries: [],
    settings: { theme: 'system', timezone: 'Asia/Shanghai' },
  };
}
export function suggest(activities: Activity[], query = '') {
  const q = normalize(query),
    rank = (a: Activity) => (normalize(a.name) === q ? 0 : normalize(a.name).startsWith(q) ? 1 : 2);
  return activities
    .filter((a) => !a.archived && normalize(a.name).includes(q))
    .sort((a, b) => (q ? rank(a) - rank(b) : 0) || b.lastUsed - a.lastUsed || a.order - b.order);
}
export function ensureActivity(data: Data, name: string): Activity {
  name = name.trim();
  if (!name || name.length > 80) throw Error('活动名称需为 1–80 个字');
  const found = data.activities.find((a) => normalize(a.name) === normalize(name));
  if (found) {
    found.archived = false;
    return found;
  }
  const a: Activity = {
    id: uid(),
    name,
    color: colors[data.activities.length % colors.length],
    icon: 'Pencil',
    category: '其他',
    order: data.activities.length,
    archived: false,
    lastUsed: 0,
    goalMinutes: 0,
    goalPeriod: 'day',
  };
  data.activities.push(a);
  return a;
}
export function toggleTimer(
  data: Data,
  name: string,
  now = Date.now(),
  note = '',
  mode: 'toggle' | 'start' = 'toggle',
) {
  const a = ensureActivity(data, name),
    running = data.entries.find((e) => e.end === null);
  if (running) {
    if (now <= running.start) throw Error('结束时间必须晚于开始时间');
    if (now - running.start < 60000) data.entries = data.entries.filter((e) => e.id !== running.id);
    else running.end = now;
  }
  if (mode === 'start' || running?.activityId !== a.id) {
    data.entries.push({ id: uid(), activityId: a.id, start: now, end: null, note });
    a.lastUsed = now;
  }
  validateData(data);
  return { discarded: !!running && now - running.start < 60000 };
}
export function saveEntry(data: Data, entry: Entry) {
  const i = data.entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) data.entries[i] = entry;
  else data.entries.push(entry);
  const a = data.activities.find((a) => a.id === entry.activityId);
  if (a) a.lastUsed = Math.max(a.lastUsed, entry.start);
  validateData(data);
}
export const dateKey = (ms: number, tz: string) => formatInTimeZone(ms, tz, 'yyyy-MM-dd');
export const shiftDate = (day: string, n: number) =>
  format(addDays(parseISO(day), n), 'yyyy-MM-dd');
export const shiftMonth = (day: string, n: number) =>
  format(addMonths(parseISO(day), n), 'yyyy-MM-dd');
export function dayBounds(day: string, tz: string): [number, number] {
  return [
    fromZonedTime(`${day}T00:00:00`, tz).getTime(),
    fromZonedTime(`${shiftDate(day, 1)}T00:00:00`, tz).getTime(),
  ];
}
export function rangeDays(day: string, period: 'day' | 'week' | 'month') {
  const p = parseISO(day),
    first =
      period === 'day'
        ? day
        : format(
            period === 'week' ? startOfWeek(p, { weekStartsOn: 1 }) : startOfMonth(p),
            'yyyy-MM-dd',
          );
  const length = period === 'day' ? 1 : period === 'week' ? 7 : Number(format(endOfMonth(p), 'd'));
  return Array.from({ length }, (_, i) => shiftDate(first, i));
}
export const duration = (entry: Entry, start = -Infinity, end = Infinity, now = Date.now()) =>
  Math.max(0, Math.min(entry.end ?? now, end) - Math.max(entry.start, start));
export function totals(data: Data, days: string[], now = Date.now()) {
  const start = dayBounds(days[0], data.settings.timezone)[0],
    end = dayBounds(days.at(-1)!, data.settings.timezone)[1];
  return data.activities.map((a) => ({
    activity: a,
    ms: data.entries
      .filter((e) => e.activityId === a.id)
      .reduce((s, e) => s + duration(e, start, end, now), 0),
  }));
}
export function human(ms: number) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ''}`;
}
export function clockText(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((s / 60) % 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
export function validateData(input: unknown): asserts input is Data {
  if (!input || typeof input !== 'object') throw Error('备份格式无效');
  const d = input as Data;
  if (!Array.isArray(d.activities) || !Array.isArray(d.entries) || !d.settings)
    throw Error('缺少活动、记录或设置');
  if (d.activities.length > 1000 || d.entries.length > 100000) throw Error('数据量超出支持范围');
  if (!['light', 'dark', 'system'].includes(d.settings.theme)) throw Error('主题无效');
  try {
    new Intl.DateTimeFormat('en', { timeZone: d.settings.timezone }).format();
  } catch {
    throw Error('时区无效');
  }
  if (typeof d.settings.timezone !== 'string') throw Error('时区无效');
  const ids = new Set<string>(),
    names = new Set<string>();
  for (const a of d.activities) {
    if (
      typeof a.id !== 'string' ||
      !a.id ||
      ids.has(a.id) ||
      typeof a.name !== 'string' ||
      !a.name.trim() ||
      a.name.length > 80 ||
      names.has(normalize(a.name))
    )
      throw Error('活动名称或 ID 重复／无效');
    if (
      !/^#[0-9a-f]{6}$/i.test(a.color) ||
      !icons.includes(a.icon) ||
      typeof a.category !== 'string' ||
      a.category.length > 80 ||
      typeof a.archived !== 'boolean' ||
      !Number.isFinite(a.order) ||
      !Number.isFinite(a.lastUsed) ||
      !Number.isFinite(a.goalMinutes) ||
      a.goalMinutes < 0 ||
      a.goalMinutes > 10080 ||
      !['day', 'week'].includes(a.goalPeriod)
    )
      throw Error('活动设置无效');
    ids.add(a.id);
    names.add(normalize(a.name));
  }
  const entryIds = new Set<string>();
  let running = 0;
  for (const e of d.entries) {
    if (
      typeof e.id !== 'string' ||
      !e.id ||
      entryIds.has(e.id) ||
      !ids.has(e.activityId) ||
      !Number.isFinite(e.start) ||
      e.start < 0 ||
      e.start > 8640000000000000 ||
      !(
        e.end === null ||
        (Number.isFinite(e.end) && e.end > e.start && e.end <= 8640000000000000)
      ) ||
      typeof e.note !== 'string' ||
      e.note.length > 10000
    )
      throw Error('记录的活动、时间或备注无效');
    entryIds.add(e.id);
    if (e.end === null) running++;
  }
  if (running > 1) throw Error('同一时间只能计时一项活动');
  const sorted = [...d.entries].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++)
    if ((sorted[i - 1].end ?? Infinity) > sorted[i].start)
      throw Error('记录时间重叠，请调整起止时间');
}
export function parseBackup(text: string): Data {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    throw Error('不是有效的 JSON 文件');
  }
  if (b?.app !== 'MengDay' || b.version !== 1) throw Error('不支持的备份格式版本');
  validateData(b.data);
  return b.data;
}
export const backup = (data: Data) =>
  JSON.stringify(
    { app: 'MengDay', version: 1, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
export function mergeData(current: Data, incoming: Data, prefer: 'local' | 'incoming'): Data {
  const result = structuredClone(current),
    mapping = new Map<string, string>();
  for (const a of incoming.activities) {
    const same =
      result.activities.find((x) => x.id === a.id) ||
      result.activities.find((x) => normalize(x.name) === normalize(a.name));
    if (same) {
      mapping.set(a.id, same.id);
      if (prefer === 'incoming') Object.assign(same, a, { id: same.id });
    } else {
      result.activities.push(structuredClone(a));
      mapping.set(a.id, a.id);
    }
  }
  for (const e of incoming.entries) {
    const mapped = { ...e, activityId: mapping.get(e.activityId)! },
      i = result.entries.findIndex((x) => x.id === e.id);
    if (i === -1) result.entries.push(mapped);
    else if (prefer === 'incoming') result.entries[i] = mapped;
  }
  if (prefer === 'incoming') result.settings = structuredClone(incoming.settings);
  validateData(result);
  return result;
}
export function csv(data: Data) {
  const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [
      ['活动', '分类', '开始时间', '结束时间', '时长（分钟）', '备注'],
      ...data.entries.map((e) => {
        const a = data.activities.find((a) => a.id === e.activityId)!;
        return [
          a.name,
          a.category,
          formatInTimeZone(e.start, data.settings.timezone, 'yyyy-MM-dd HH:mm:ss XXX'),
          e.end
            ? formatInTimeZone(e.end, data.settings.timezone, 'yyyy-MM-dd HH:mm:ss XXX')
            : '计时中',
          (duration(e) / 60000).toFixed(2),
          e.note,
        ];
      }),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  );
}

export function categoryTotals(data: Data, days: string[], now: number) {
  const groups = new Map<
    string,
    { name: string; color: string; ms: number; activities: ReturnType<typeof totals> }
  >();
  for (const item of totals(data, days, now).filter((t) => t.ms > 0)) {
    const name = item.activity.category.trim() || '其他';
    let group = groups.get(name);
    if (!group) {
      const hash = Array.from(name).reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 0);
      group = { name, color: colors[hash % colors.length], ms: 0, activities: [] };
      groups.set(name, group);
    }
    group.ms += item.ms;
    group.activities.push(item);
  }
  return [...groups.values()]
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
    .map((g) => ({ ...g, activities: g.activities.sort((a, b) => b.ms - a.ms) }));
}
