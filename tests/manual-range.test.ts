import { expect, it } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';
import { manualRange } from '../src/model';

it('uses the selected day and account timezone clock', () => {
  const now = Date.parse('2026-09-19T08:10:00Z');
  const r = manualRange('2026-09-10', 'Asia/Shanghai', now);
  expect(formatInTimeZone(r.end, 'Asia/Shanghai', 'yyyy-MM-dd HH:mm:ss')).toBe(
    '2026-09-10 16:10:00',
  );
  expect(r.end - r.start).toBe(1800000);
  const other = manualRange('2026-09-10', 'America/New_York', now);
  expect(formatInTimeZone(other.end, 'America/New_York', 'HH:mm:ss')).toBe('04:10:00');
});

it('keeps positive intervals on the selected date at midnight and during DST', () => {
  for (const [day, tz, now] of [
    ['2026-09-10', 'Asia/Shanghai', '2026-09-18T16:00:00Z'],
    ['2026-09-10', 'Asia/Shanghai', '2026-09-18T16:10:00Z'],
    ['2026-03-08', 'America/New_York', '2026-09-19T06:10:00Z'],
  ]) {
    const r = manualRange(day, tz, Date.parse(now));
    expect(r.end).toBeGreaterThan(r.start);
    expect(formatInTimeZone(r.start, tz, 'yyyy-MM-dd')).toBe(day);
    expect(formatInTimeZone(r.end, tz, 'yyyy-MM-dd')).toBe(day);
  }
});
