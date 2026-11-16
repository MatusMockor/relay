import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { calendarSubscriptions } from './calendar-subscriptions';
import { googleCalendars } from './google-calendars';

export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => calendarSubscriptions.id, {
      onDelete: 'cascade',
    }),
    googleCalendarId: text('google_calendar_id').references(() => googleCalendars.id, {
      onDelete: 'cascade',
    }),
    remoteId: text('remote_id'),
    remoteEtag: text('remote_etag'),
    seriesKey: text('series_key').notNull(),
    uid: text('uid').notNull(),
    recurrenceKey: text('recurrence_key').notNull(),
    recurrenceId: text('recurrence_id'),
    thisAndFuture: integer('this_and_future', { mode: 'boolean' }).notNull().default(false),
    sequence: integer('sequence').notNull(),
    dtstamp: text('dtstamp'),
    method: text('method'),
    status: text('status').notNull(),
    summary: text('summary').notNull(),
    location: text('location'),
    description: text('description'),
    organizer: text('organizer', { mode: 'json' }),
    attendees: text('attendees', { mode: 'json' }).notNull(),
    myPartstat: text('my_partstat'),
    myEmail: text('my_email'),
    allDay: integer('all_day', { mode: 'boolean' }).notNull(),
    startsAt: text('starts_at').notNull(),
    startsTs: integer('starts_ts').notNull(),
    endsAt: text('ends_at').notNull(),
    recurring: integer('recurring', { mode: 'boolean' }).notNull(),
    rangeEndsAt: text('range_ends_at'),
    rangeEndsTs: integer('range_ends_ts'),
    ics: text('ics').notNull(),
    messageId: text('message_id'),
    threadId: text('thread_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
  },
  (table) => [
    uniqueIndex('calendar_events_series_recurrence_unique').on(
      table.seriesKey,
      table.recurrenceKey,
    ),
    index('calendar_events_user_start_idx').on(table.userId, table.startsTs),
    index('calendar_events_user_thread_idx').on(table.userId, table.threadId),
    index('calendar_events_subscription_idx').on(table.subscriptionId),
    index('calendar_events_google_remote_idx').on(table.googleCalendarId, table.remoteId),
  ],
);

export type CalendarEventRow = typeof calendarEvents.$inferSelect;
