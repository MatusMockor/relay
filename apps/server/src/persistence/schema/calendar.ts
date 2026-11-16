import type {
  AccountId,
  Address,
  CalendarAttendee,
  CalendarEventId,
  CalendarEventStatus,
  CalendarMethod,
  CalendarPartStat,
  CalendarSubscriptionId,
  CalendarSubscriptionStatus,
  GoogleCalendarId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz } from './columns';
import { googleCalendars } from './google-calendar';
import { users } from './users';

export const calendarSubscriptions = pgTable(
  'calendar_subscriptions',
  {
    id: text('id').$type<CalendarSubscriptionId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    host: text('host').notNull(),
    urlEnvelope: text('url_envelope'),
    status: text('status').$type<CalendarSubscriptionStatus>().notNull(),
    lastError: text('last_error'),
    lastSyncedAt: timestampTz('last_synced_at'),
    eventCount: integer('event_count').notNull(),
    etag: text('etag'),
    lastModified: text('last_modified'),
    lastAttemptAt: timestampTz('last_attempt_at'),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (table) => [
    index('calendar_subscriptions_user_idx').on(table.userId, table.createdAt),
    index('calendar_subscriptions_attempt_idx').on(table.lastAttemptAt),
  ],
);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: text('id').$type<CalendarEventId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id')
      .$type<CalendarSubscriptionId>()
      .references(() => calendarSubscriptions.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id')
      .$type<GoogleCalendarId>()
      .references(() => googleCalendars.id, { onDelete: 'cascade' }),
    remoteId: text('remote_id'),
    remoteEtag: text('remote_etag'),
    seriesKey: text('series_key').notNull(),
    uid: text('uid').notNull(),
    recurrenceKey: text('recurrence_key').notNull(),
    recurrenceId: text('recurrence_id'),
    thisAndFuture: boolean('this_and_future').notNull().default(false),
    sequence: integer('sequence').notNull(),
    dtstamp: timestampTz('dtstamp'),
    method: text('method').$type<CalendarMethod>(),
    status: text('status').$type<CalendarEventStatus>().notNull(),
    summary: text('summary').notNull(),
    location: text('location'),
    description: text('description'),
    organizer: jsonb('organizer').$type<Address>(),
    attendees: jsonb('attendees').$type<CalendarAttendee[]>().notNull(),
    myPartstat: text('my_partstat').$type<CalendarPartStat>(),
    myEmail: text('my_email'),
    allDay: boolean('all_day').notNull(),
    startsAt: timestampTz('starts_at').notNull(),
    endsAt: timestampTz('ends_at').notNull(),
    recurring: boolean('recurring').notNull(),
    rangeEndsAt: timestampTz('range_ends_at'),
    ics: text('ics').notNull(),
    messageId: text('message_id').$type<MessageId>(),
    threadId: text('thread_id').$type<ThreadId>(),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    uniqueIndex('calendar_events_series_recurrence_unique').on(
      table.seriesKey,
      table.recurrenceKey,
    ),
    index('calendar_events_user_start_idx').on(table.userId, table.startsAt),
    index('calendar_events_user_thread_idx').on(table.userId, table.threadId),
    index('calendar_events_subscription_idx').on(table.subscriptionId),
    index('calendar_events_google_remote_idx').on(table.googleCalendarId, table.remoteId),
    check(
      'calendar_events_one_source',
      sql`num_nonnulls(${table.accountId}, ${table.subscriptionId}, ${table.googleCalendarId}) = 1`,
    ),
  ],
);

export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type CalendarSubscriptionRow = typeof calendarSubscriptions.$inferSelect;
