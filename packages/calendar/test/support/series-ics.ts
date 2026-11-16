import type { CalendarEventData, CalendarSeries, CalendarWindow } from '@relay/engine';
import { IcalCalendarExpander, IcalCalendarParser } from '../../src';
import { present, seriesOf } from './fixtures';

export const parser = new IcalCalendarParser();
export const expander = new IcalCalendarExpander();

export const CENTRAL_EUROPE = [
  'BEGIN:VTIMEZONE',
  'TZID:Central Europe Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16010101T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:16010101T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

export const stampAt = (sequence: number, minute: string): string =>
  `DTSTAMP:20261102T${String(10 + sequence).padStart(2, '0')}${minute}00Z`;

export const vcalendar = (
  method: string | null,
  zones: readonly string[],
  ...events: (readonly string[])[]
): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relay//Test//EN',
    ...(method === null ? [] : [`METHOD:${method}`]),
    ...zones,
    ...events.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']),
    'END:VCALENDAR',
    '',
  ].join('\r\n');

export const parsedEvents = (...texts: string[]): CalendarEventData[] =>
  texts.flatMap((text) => present(parser.parse(text)).events);

export const seriesFrom = (uid: string, ...texts: string[]): CalendarSeries =>
  seriesOf(parsedEvents(...texts), uid);

export const windowOf = (
  from: string,
  to: string,
  timeZone = 'Europe/Bratislava',
): CalendarWindow => ({
  from,
  to,
  timeZone,
});

export const startsOf = (series: CalendarSeries, window: CalendarWindow): string[] =>
  expander
    .expand(series, window)
    .filter((occurrence) => occurrence.event.status !== 'cancelled')
    .map((occurrence) => occurrence.start);

export const rangeEndOf = (series: CalendarSeries): string | null =>
  expander.seriesRangeEnd(present(series.master), series.overrides);
