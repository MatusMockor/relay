export interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  const cached = formatters.get(zone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  formatters.set(zone, formatter);
  return formatter;
};

export const isIanaZone = (zone: string): boolean => {
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
};

const offsetAt = (instant: number, zone: string): number => {
  const parts = formatterFor(zone).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
};

const DAY_MS = 86_400_000;

export const wallTimeAt = (instant: number, zone: string): WallTime => {
  const shifted = new Date(instant + offsetAt(instant, zone));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
};

export const wallTimeToInstant = (wall: WallTime, zone: string): number => {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const before = offsetAt(guess - DAY_MS, zone);
  const after = offsetAt(guess + DAY_MS, zone);
  const valid = [guess - before, guess - after].filter(
    (candidate, index) => offsetAt(candidate, zone) === (index === 0 ? before : after),
  );
  if (valid.length === 0) {
    return guess - before;
  }
  return Math.min(...valid);
};
