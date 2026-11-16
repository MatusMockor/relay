import ICAL from 'ical.js';
import { type IcalTime, instantOf } from './ical-time';
import { periodDurations } from './rdate-periods';
import { seriesEndOf } from './series-range';

type Component = InstanceType<typeof ICAL.Component>;
type Event = InstanceType<typeof ICAL.Event>;

const DAY_MS = 86_400_000;

export interface EventTiming {
  readonly allDay: boolean;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly recurring: boolean;
  readonly rangeEndsAt: number | null;
}

export const tzidOf = (component: Component, name: string): string | null => {
  const value: unknown = component.getFirstProperty(name)?.getParameter('tzid');
  return typeof value === 'string' ? value : null;
};

export const endTimeOf = (event: Event, start: IcalTime): IcalTime => {
  const hasEnd = event.component.hasProperty('dtend') || event.component.hasProperty('duration');
  if (hasEnd && event.endDate.compare(start) >= 0) {
    return event.endDate;
  }
  const end = start.clone();
  if (start.isDate) {
    end.adjust(1, 0, 0, 0);
  }
  return end;
};

export const isRecurringMaster = (vevent: Component): boolean =>
  !vevent.hasProperty('recurrence-id') &&
  (vevent.hasProperty('rrule') || vevent.hasProperty('rdate'));

export const timingOf = (vevent: Component): EventTiming | null => {
  if (!vevent.hasProperty('dtstart')) {
    return null;
  }
  const event = new ICAL.Event(vevent);
  const start = event.startDate;
  const end = endTimeOf(event, start);
  const tzid = tzidOf(vevent, 'dtstart');
  const startsAt = instantOf(start, tzid, 'UTC');
  const endsAt = Math.max(startsAt, instantOf(end, tzidOf(vevent, 'dtend') ?? tzid, 'UTC'));
  const recurring = isRecurringMaster(vevent);
  const longest = Math.max(endsAt - startsAt, ...periodDurations(vevent).values());
  const rangeEndsAt = recurring
    ? seriesEndOf(event, tzid, longest)
    : endsAt + (start.isDate ? DAY_MS : 0);
  return { allDay: start.isDate, startsAt, endsAt, recurring, rangeEndsAt };
};
