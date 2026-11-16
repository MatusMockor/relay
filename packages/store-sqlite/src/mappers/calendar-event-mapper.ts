import type { CalendarSource, StoredCalendarEvent } from '@relay/engine';
import {
  AccountIdSchema,
  AddressSchema,
  CalendarAttendeeSchema,
  CalendarEventIdSchema,
  CalendarEventStatusSchema,
  CalendarMethodSchema,
  CalendarPartStatSchema,
  CalendarSubscriptionIdSchema,
  GoogleCalendarIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import { z } from 'zod';
import type { CalendarEventRow, calendarEvents } from '../schema';
import { toTimestamp } from './timestamp';

const AttendeesSchema = z.array(CalendarAttendeeSchema);

export const sourceKeyOf = (source: CalendarSource): string => {
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
    return { kind: 'google', calendarId: GoogleCalendarIdSchema.parse(row.googleCalendarId) };
  }
  if (row.subscriptionId !== null) {
    return {
      kind: 'subscription',
      subscriptionId: CalendarSubscriptionIdSchema.parse(row.subscriptionId),
    };
  }
  return { kind: 'invite', accountId: AccountIdSchema.parse(row.accountId) };
};

export const toStoredCalendarEvent = (row: CalendarEventRow): StoredCalendarEvent => ({
  id: CalendarEventIdSchema.parse(row.id),
  userId: UserIdSchema.parse(row.userId),
  source: sourceOf(row),
  uid: row.uid,
  recurrenceId: row.recurrenceId,
  ...(row.thisAndFuture ? { thisAndFuture: true } : {}),
  ...(row.endsSeries ? { endsSeries: true } : {}),
  ...(row.rangeSequence === null
    ? {}
    : { rangeRevision: { sequence: row.rangeSequence, dtstamp: row.rangeDtstamp } }),
  sequence: row.sequence,
  dtstamp: row.dtstamp,
  method: CalendarMethodSchema.nullable().parse(row.method),
  status: CalendarEventStatusSchema.parse(row.status),
  summary: row.summary,
  location: row.location,
  description: row.description,
  organizer: AddressSchema.nullable().parse(row.organizer),
  attendees: AttendeesSchema.parse(row.attendees),
  myPartstat: CalendarPartStatSchema.nullable().parse(row.myPartstat),
  myEmail: row.myEmail,
  allDay: row.allDay,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  recurring: row.recurring,
  rangeEndsAt: row.rangeEndsAt,
  ics: row.ics,
  messageId: MessageIdSchema.nullable().parse(row.messageId),
  threadId: ThreadIdSchema.nullable().parse(row.threadId),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  revision: row.revision,
});

export const toCalendarEventRow = (
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
  rangeDtstamp: event.rangeRevision?.dtstamp ?? null,
  sequence: event.sequence,
  dtstamp: event.dtstamp,
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
  startsAt: event.startsAt,
  startsTs: toTimestamp(event.startsAt),
  endsAt: event.endsAt,
  recurring: event.recurring,
  rangeEndsAt: event.rangeEndsAt,
  rangeEndsTs: event.rangeEndsAt === null ? null : toTimestamp(event.rangeEndsAt),
  ics: event.ics,
  messageId: event.messageId,
  threadId: event.threadId,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  revision: 1,
});
