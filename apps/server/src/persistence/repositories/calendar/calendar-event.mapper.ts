import type { CalendarSource, StoredCalendarEvent } from '@relay/engine';
import { AddressSchema, CalendarAttendeeSchema } from '@relay/shared/domain';
import { z } from 'zod';
import type { CalendarEventRow, calendarEvents } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

const AttendeesSchema = z.array(CalendarAttendeeSchema);

const sourceKeyOf = (source: CalendarSource): string => {
  if (source.kind === 'invite') {
    return source.accountId;
  }
  if (source.kind === 'subscription') {
    return source.subscriptionId;
  }
  return source.calendarId;
};

export const seriesKeyOf = (source: CalendarSource, uid: string): string =>
  `${source.kind}:${sourceKeyOf(source)}:${uid}`;

const sourceOf = (row: CalendarEventRow): CalendarSource => {
  if (row.googleCalendarId !== null) {
    return { kind: 'google', calendarId: row.googleCalendarId };
  }
  if (row.subscriptionId !== null) {
    return { kind: 'subscription', subscriptionId: row.subscriptionId };
  }
  if (row.accountId === null) {
    throw new Error(`Calendar event ${row.id} has no source`);
  }
  return { kind: 'invite', accountId: row.accountId };
};

export const toStoredCalendarEvent = (row: CalendarEventRow): StoredCalendarEvent => ({
  id: row.id,
  userId: row.userId,
  source: sourceOf(row),
  uid: row.uid,
  recurrenceId: row.recurrenceId,
  ...(row.thisAndFuture ? { thisAndFuture: true } : {}),
  ...(row.endsSeries ? { endsSeries: true } : {}),
  ...(row.rangeSequence === null
    ? {}
    : { rangeRevision: { sequence: row.rangeSequence, dtstamp: toIsoOrNull(row.rangeDtstamp) } }),
  sequence: row.sequence,
  dtstamp: toIsoOrNull(row.dtstamp),
  method: row.method,
  status: row.status,
  summary: row.summary,
  location: row.location,
  description: row.description,
  organizer: AddressSchema.nullable().parse(row.organizer),
  attendees: AttendeesSchema.parse(row.attendees),
  myPartstat: row.myPartstat,
  myEmail: row.myEmail,
  allDay: row.allDay,
  startsAt: toIso(row.startsAt),
  endsAt: toIso(row.endsAt),
  recurring: row.recurring,
  rangeEndsAt: toIsoOrNull(row.rangeEndsAt),
  ics: row.ics,
  messageId: row.messageId,
  threadId: row.threadId,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  revision: row.revision,
});

export const toCalendarEventInsert = (
  event: StoredCalendarEvent,
): typeof calendarEvents.$inferInsert => ({
  id: event.id,
  userId: event.userId,
  accountId: event.source.kind === 'invite' ? event.source.accountId : null,
  subscriptionId: event.source.kind === 'subscription' ? event.source.subscriptionId : null,
  googleCalendarId: event.source.kind === 'google' ? event.source.calendarId : null,
  seriesKey: seriesKeyOf(event.source, event.uid),
  uid: event.uid,
  recurrenceKey: event.recurrenceId ?? '',
  recurrenceId: event.recurrenceId,
  thisAndFuture: event.thisAndFuture === true,
  endsSeries: event.endsSeries === true,
  rangeSequence: event.rangeRevision?.sequence ?? null,
  rangeDtstamp: toDateOrNull(event.rangeRevision?.dtstamp ?? null),
  sequence: event.sequence,
  dtstamp: toDateOrNull(event.dtstamp),
  method: event.method,
  status: event.status,
  summary: event.summary,
  location: event.location,
  description: event.description,
  organizer: event.organizer,
  attendees: [...event.attendees],
  myPartstat: event.myPartstat,
  myEmail: event.myEmail,
  allDay: event.allDay,
  startsAt: toDate(event.startsAt),
  endsAt: toDate(event.endsAt),
  recurring: event.recurring,
  rangeEndsAt: toDateOrNull(event.rangeEndsAt),
  ics: event.ics,
  messageId: event.messageId,
  threadId: event.threadId,
  createdAt: toDate(event.createdAt),
  updatedAt: toDate(event.updatedAt),
  revision: 1,
});
