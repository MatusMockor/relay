import type { CalendarRevision, StoredCalendarEvent } from '@relay/engine';

type Revisioned = Pick<StoredCalendarEvent, 'sequence' | 'dtstamp'>;

const stampOf = (value: string | null): number => (value === null ? 0 : Date.parse(value));

export const compareRevision = (a: Revisioned, b: Revisioned): number =>
  a.sequence - b.sequence || stampOf(a.dtstamp) - stampOf(b.dtstamp);

export const rangeRevisionOf = (event: StoredCalendarEvent): CalendarRevision =>
  event.rangeRevision ?? { sequence: event.sequence, dtstamp: event.dtstamp };
