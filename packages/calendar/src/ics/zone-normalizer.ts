import ICAL from 'ical.js';
import { type IcalTime, isResolvedZone } from './ical-time';
import { flattenPeriods } from './rdate-periods';
import { isIanaZone, wallTimeAt } from './wall-clock';

type Component = InstanceType<typeof ICAL.Component>;
type Property = InstanceType<typeof ICAL.Property>;

const isTime = (value: unknown): value is IcalTime => value instanceof ICAL.Time;
const isRecur = (value: unknown): value is InstanceType<typeof ICAL.Recur> =>
  value instanceof ICAL.Recur;

const toWall = (time: IcalTime, zone: string): IcalTime => {
  if (time.isDate || time.zone !== ICAL.Timezone.utcTimezone) {
    return time;
  }
  return new ICAL.Time(
    { ...wallTimeAt(time.toUnixTime() * 1000, zone), isDate: false },
    ICAL.Timezone.localTimezone,
  );
};

const replaceValues = (vevent: Component, property: Property, values: IcalTime[]): void => {
  const tzid: unknown = property.getParameter('tzid');
  const replacement = new ICAL.Property(property.name);
  replacement.setValues(values);
  if (typeof tzid === 'string') {
    replacement.setParameter('tzid', tzid);
  }
  vevent.removeProperty(property);
  vevent.addProperty(replacement);
};

const localizeUtc = (vevent: Component, zone: string): void => {
  for (const property of vevent.getAllProperties('rrule')) {
    const rule: unknown = property.getFirstValue();
    if (isRecur(rule) && rule.until !== null && isTime(rule.until)) {
      rule.until = toWall(rule.until, zone);
      property.setValue(rule);
    }
  }
  for (const name of ['exdate', 'rdate']) {
    for (const property of vevent.getAllProperties(name)) {
      const values: unknown[] = property.getValues();
      if (
        values.every(isTime) &&
        values.some((value) => value.zone === ICAL.Timezone.utcTimezone)
      ) {
        replaceValues(
          vevent,
          property,
          values.map((value) => toWall(value, zone)),
        );
        vevent.getAllProperties(name).at(-1)?.setParameter('tzid', zone);
      }
    }
  }
};

export const normalizeEvent = (vevent: Component): void => {
  flattenPeriods(vevent);
  const start: unknown = vevent.getFirstPropertyValue('dtstart');
  const tzid: unknown = vevent.getFirstProperty('dtstart')?.getParameter('tzid');
  if (!isTime(start) || start.isDate || typeof tzid !== 'string') {
    return;
  }
  if (isResolvedZone(start) || !isIanaZone(tzid)) {
    return;
  }
  localizeUtc(vevent, tzid);
};
