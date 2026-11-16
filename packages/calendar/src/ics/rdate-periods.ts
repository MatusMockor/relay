import ICAL from 'ical.js';
import { type IcalTime, instantOf, recurrenceKeyOf } from './ical-time';

type Component = InstanceType<typeof ICAL.Component>;
type Period = InstanceType<typeof ICAL.Period>;

const DURATION_PROPERTY = 'x-relay-rdate-duration';
const SEPARATOR = '|';

const isTime = (value: unknown): value is IcalTime => value instanceof ICAL.Time;
const isPeriod = (value: unknown): value is Period => value instanceof ICAL.Period;

const tzidParameter = (component: Component, name: string): string | null => {
  const value: unknown = component.getFirstProperty(name)?.getParameter('tzid');
  return typeof value === 'string' ? value : null;
};

const lengthMs = (period: Period, tzid: string | null): number => {
  const duration: unknown = period.duration;
  if (duration instanceof ICAL.Duration) {
    return Math.max(0, duration.toSeconds() * 1000);
  }
  const start = instantOf(period.start, tzid, 'UTC');
  return Math.max(0, instantOf(period.getEnd(), tzid, 'UTC') - start);
};

const recordDuration = (vevent: Component, key: string, milliseconds: number): void => {
  const property = new ICAL.Property(DURATION_PROPERTY);
  property.setValue(`${key}${SEPARATOR}${String(milliseconds)}`);
  vevent.addProperty(property);
};

export const flattenPeriods = (vevent: Component): void => {
  const startTzid = tzidParameter(vevent, 'dtstart');
  for (const property of vevent.getAllProperties('rdate')) {
    const values: unknown[] = property.getValues();
    if (!values.some(isPeriod)) {
      continue;
    }
    const tzid: unknown = property.getParameter('tzid');
    const periodTzid = typeof tzid === 'string' ? tzid : startTzid;
    const starts = values.flatMap((value) => {
      if (isPeriod(value)) {
        recordDuration(
          vevent,
          recurrenceKeyOf(value.start, startTzid),
          lengthMs(value, periodTzid),
        );
        return [value.start];
      }
      return isTime(value) ? [value] : [];
    });
    const replacement = new ICAL.Property('rdate');
    replacement.setValues(starts);
    if (typeof tzid === 'string') {
      replacement.setParameter('tzid', tzid);
    }
    vevent.removeProperty(property);
    vevent.addProperty(replacement);
  }
};

export const periodDurations = (vevent: Component): ReadonlyMap<string, number> =>
  new Map(
    vevent.getAllProperties(DURATION_PROPERTY).flatMap((property): [string, number][] => {
      const value: unknown = property.getFirstValue();
      const text = typeof value === 'string' ? value : '';
      const index = text.lastIndexOf(SEPARATOR);
      const milliseconds = Number(text.slice(index + 1));
      if (index <= 0 || !Number.isFinite(milliseconds)) {
        return [];
      }
      return [[text.slice(0, index), milliseconds]];
    }),
  );
