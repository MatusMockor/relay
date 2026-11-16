import type { StoredCalendarEvent } from '@relay/engine';
import ICAL from 'ical.js';
import { endTimeOf, tzidOf } from '../ics/event-timing';
import { periodDurations } from '../ics/rdate-periods';
import { parseCalendar } from '../ics/standalone-ics';
import type { ZonedTime } from './occurrence-span';

type Event = InstanceType<typeof ICAL.Event>;

type Duration = InstanceType<typeof ICAL.Duration>;

export interface ParsedEvent {
  readonly event: Event;
  readonly start: ZonedTime;
  readonly end: ZonedTime;
  readonly nominal: Duration | null;
  readonly periods: ReadonlyMap<string, number>;
}

const isDuration = (value: unknown): value is Duration => value instanceof ICAL.Duration;

const nominalOf = (event: Event): Duration | null => {
  const declared: unknown = event.component.getFirstPropertyValue('duration');
  if (isDuration(declared)) {
    return declared;
  }
  if (!event.startDate.isDate) {
    return null;
  }
  return endTimeOf(event, event.startDate).subtractDate(event.startDate);
};

const CACHE_LIMIT = 500;
const cache = new Map<string, ParsedEvent | null>();

const load = (stored: StoredCalendarEvent): ParsedEvent | null => {
  const vevent = parseCalendar(stored.ics)?.getFirstSubcomponent('vevent') ?? null;
  if (vevent === null || !vevent.hasProperty('dtstart')) {
    return null;
  }
  const event = new ICAL.Event(vevent);
  const startTzid = tzidOf(vevent, 'dtstart');
  return {
    event,
    start: { time: event.startDate, tzid: startTzid },
    end: { time: endTimeOf(event, event.startDate), tzid: tzidOf(vevent, 'dtend') ?? startTzid },
    nominal: nominalOf(event),
    periods: periodDurations(vevent),
  };
};

export const parsedEventOf = (stored: StoredCalendarEvent): ParsedEvent | null => {
  if (cache.has(stored.ics)) {
    return cache.get(stored.ics) ?? null;
  }
  const parsed = load(stored);
  if (cache.size >= CACHE_LIMIT) {
    cache.clear();
  }
  cache.set(stored.ics, parsed);
  return parsed;
};
