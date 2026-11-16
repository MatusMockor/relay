import type { CalendarParser, ParsedCalendar, ParsedCalendarEvent } from '@relay/engine';
import type { CalendarMethod } from '@relay/shared/domain';
import ICAL from 'ical.js';
import { attendeesOf, organizerOf } from './event-people';
import { methodOf, sequenceOf, statusOf, textOf } from './event-text';
import { type EventTiming, timingOf, tzidOf } from './event-timing';
import { recurrenceKeyOf, toIso } from './ical-time';
import { isThisAndFuture } from './recurrence-range';
import { parseCalendar, standaloneIcs } from './standalone-ics';
import { normalizeEvent } from './zone-normalizer';

type Component = InstanceType<typeof ICAL.Component>;

export const MAX_CALENDAR_BYTES = 10 * 1024 * 1024;

const isTime = (value: unknown): value is InstanceType<typeof ICAL.Time> =>
  value instanceof ICAL.Time;

const recurrenceIdOf = (vevent: Component): string | null => {
  const value: unknown = vevent.getFirstPropertyValue('recurrence-id');
  return isTime(value) ? recurrenceKeyOf(value, tzidOf(vevent, 'recurrence-id')) : null;
};

const dtstampOf = (vevent: Component): string | null => {
  const value: unknown = vevent.getFirstPropertyValue('dtstamp');
  return isTime(value) ? value.toJSDate().toISOString() : null;
};

const SCHEDULING_ONLY = new Set<CalendarMethod | null>(['CANCEL', 'REPLY']);

const untimed = (recurrenceId: string | null, dtstamp: string | null): EventTiming => {
  const anchor = Date.parse(recurrenceId ?? dtstamp ?? '');
  const instant = Number.isNaN(anchor) ? 0 : anchor;
  return {
    allDay: false,
    startsAt: instant,
    endsAt: instant,
    recurring: false,
    rangeEndsAt: instant,
  };
};

const eventOf = (
  calendar: Component,
  vevent: Component,
  method: CalendarMethod | null,
): ParsedCalendarEvent | null => {
  normalizeEvent(vevent);
  const uid = textOf(vevent, 'uid', 1000);
  const recurrenceId = recurrenceIdOf(vevent);
  const timed = timingOf(vevent);
  if (uid === null || (timed === null && !SCHEDULING_ONLY.has(method))) {
    return null;
  }
  const timing = timed ?? untimed(recurrenceId, dtstampOf(vevent));
  return {
    uid,
    timed: timed !== null,
    recurrenceId,
    ...(recurrenceId !== null && isThisAndFuture(vevent) ? { thisAndFuture: true } : {}),
    sequence: sequenceOf(vevent),
    dtstamp: dtstampOf(vevent),
    status: statusOf(vevent, method),
    summary: textOf(vevent, 'summary', 500) ?? '',
    location: textOf(vevent, 'location', 500),
    description: textOf(vevent, 'description', 10_000),
    organizer: organizerOf(vevent),
    attendees: attendeesOf(vevent),
    allDay: timing.allDay,
    startsAt: toIso(timing.startsAt),
    endsAt: toIso(timing.endsAt),
    recurring: timing.recurring,
    rangeEndsAt: timing.rangeEndsAt === null ? null : toIso(timing.rangeEndsAt),
    ics: standaloneIcs(calendar, vevent),
  };
};

const safeEventOf = (
  calendar: Component,
  vevent: Component,
  method: CalendarMethod | null,
): ParsedCalendarEvent[] => {
  try {
    const event = eventOf(calendar, vevent, method);
    return event === null ? [] : [event];
  } catch {
    return [];
  }
};

export class IcalCalendarParser implements CalendarParser {
  parse(text: string): ParsedCalendar | null {
    if (text.length > MAX_CALENDAR_BYTES) {
      return null;
    }
    const calendar = parseCalendar(text);
    if (calendar === null) {
      return null;
    }
    const method = methodOf(calendar);
    const events = calendar
      .getAllSubcomponents('vevent')
      .flatMap((vevent) => safeEventOf(calendar, vevent, method));
    return { method, events };
  }
}
