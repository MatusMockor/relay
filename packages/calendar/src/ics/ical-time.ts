import ICAL from 'ical.js';
import { isIanaZone, type WallTime, wallTimeToInstant } from './wall-clock';

export type IcalTime = InstanceType<typeof ICAL.Time>;

export const isResolvedZone = (time: IcalTime): boolean =>
  time.zone !== ICAL.Timezone.localTimezone;

const wallOf = (time: IcalTime): WallTime => ({
  year: time.year,
  month: time.month,
  day: time.day,
  hour: time.isDate ? 0 : time.hour,
  minute: time.isDate ? 0 : time.minute,
  second: time.isDate ? 0 : time.second,
});

export const instantOf = (time: IcalTime, tzid: string | null, fallbackZone: string): number => {
  if (time.isDate) {
    return wallTimeToInstant(wallOf(time), fallbackZone);
  }
  if (isResolvedZone(time)) {
    return time.toUnixTime() * 1000;
  }
  const zone = tzid !== null && isIanaZone(tzid) ? tzid : fallbackZone;
  return wallTimeToInstant(wallOf(time), zone);
};

export const isFloating = (time: IcalTime, tzid: string | null): boolean =>
  !time.isDate && !isResolvedZone(time) && (tzid === null || !isIanaZone(tzid));

const pad = (value: number): string => String(value).padStart(2, '0');

export const dateKey = (time: IcalTime): string =>
  `${String(time.year)}-${pad(time.month)}-${pad(time.day)}`;

export const recurrenceKeyOf = (time: IcalTime, tzid: string | null): string => {
  if (time.isDate) {
    return dateKey(time);
  }
  if (isFloating(time, tzid)) {
    return `${dateKey(time)}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
  }
  return new Date(instantOf(time, tzid, 'UTC')).toISOString();
};

export const toIso = (instant: number): string => new Date(instant).toISOString();
