/** Evaluate only simple, explicit OSM weekly hours. Anything richer stays unknown. */
const weekday = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 } as const;
type Weekday = keyof typeof weekday;
type WallTime = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

export function wallTime(date: Date, timezone: string): WallTime | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit' }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const day = value.weekday?.slice(0, 2) as Weekday;
    if (!(day in weekday)) return undefined;
    return { year: Number(value.year), month: Number(value.month), day: Number(value.day),
      weekday: weekday[day], hour: Number(value.hour), minute: Number(value.minute) };
  } catch { return undefined; }
}

/** Convert an explicit wall-clock date/time in the anchor's zone to one UTC instant. */
export function instantForWallTime(date: Pick<WallTime, 'year' | 'month' | 'day'>,
  hour: number, minute: number, timezone: string): Date | undefined {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = wallTime(new Date(instant), timezone);
    if (!actual) return undefined;
    const current = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    if (current === target) return new Date(instant);
    instant += target - current;
  }
  // DST gaps cannot be represented. The caller must leave the time unknown.
  return undefined;
}

function days(spec: string): number[] | undefined {
  const result = new Set<number>();
  for (const piece of spec.split(',')) {
    const match = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(piece.trim());
    if (!match) return undefined;
    const start = weekday[match[1] as Weekday];
    const end = match[2] ? weekday[match[2] as Weekday] : start;
    for (let cursor = start; ; cursor = (cursor + 1) % 7) {
      result.add(cursor);
      if (cursor === end) break;
    }
  }
  return [...result];
}

export function openingStatusAt(hours: string | undefined, instant: Date, timezone: string): boolean | undefined {
  if (!hours) return undefined;
  if (hours.trim() === '24/7') return true;
  const wall = wallTime(instant, timezone);
  if (!wall) return undefined;
  const schedule = new Map<number, { start: number; end: number }[]>();
  for (const clause of hours.split(';')) {
    const match = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*\s+(off|(?:\d{2}:\d{2}-\d{2}:\d{2})(?:,\s*\d{2}:\d{2}-\d{2}:\d{2})*)$/.exec(clause.trim());
    if (!match) return undefined;
    const covered = days(match[1] + clause.trim().slice(match[1].length).split(/\s+/)[0]);
    if (!covered) return undefined;
    const ranges = match[2] === 'off' ? [] : match[2].split(',').map((range) => {
      const [start, end] = range.trim().split('-').map((value) => {
        const [hour, minute] = value.split(':').map(Number);
        return hour * 60 + minute;
      });
      return { start, end };
    });
    if (ranges.some(({ start, end }) => start >= 1440 || end > 1440 || start === end)) return undefined;
    for (const day of covered) {
      if (schedule.has(day)) return undefined; // overlapping rules need a full OSM parser
      schedule.set(day, ranges);
    }
  }
  const minute = wall.hour * 60 + wall.minute;
  const today = schedule.get(wall.weekday) ?? [];
  const yesterday = schedule.get((wall.weekday + 6) % 7) ?? [];
  return today.some(({ start, end }) => minute >= start && (end > start ? minute < end : true))
    || yesterday.some(({ start, end }) => end < start && minute < end);
}
