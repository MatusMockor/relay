import { wallTimeToInstant } from '../ics/wall-clock';

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?$/;

export const keyInstant = (key: string, timeZone: string): number => {
  const local = LOCAL.exec(key);
  if (local === null) {
    return Date.parse(key);
  }
  const [, year, month, day, hour, minute, second] = local;
  return wallTimeToInstant(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour ?? 0),
      minute: Number(minute ?? 0),
      second: Number(second ?? 0),
    },
    timeZone,
  );
};
