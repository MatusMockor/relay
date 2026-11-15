import type {
  JiraKey,
  ReminderId,
  TaskId,
  TaskSource,
  TaskState,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';
import { threads } from './threads';
import { users } from './users';

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').$type<TaskId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .$type<ThreadId>()
      .references(() => threads.id, { onDelete: 'set null' }),
    jiraKey: text('jira_key').$type<JiraKey>(),
    title: text('title').notNull(),
    aiWhat: text('ai_what'),
    state: text('state').$type<TaskState>().notNull(),
    source: text('source').$type<TaskSource>().notNull(),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (table) => [
    index('tasks_user_list_idx').on(table.userId, table.updatedAt.desc(), table.id.desc()),
    index('tasks_thread_idx').on(table.threadId),
    uniqueIndex('tasks_user_jira_unique')
      .on(table.userId, table.jiraKey)
      .where(sql`${table.jiraKey} is not null`),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: text('id').$type<ReminderId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .$type<ThreadId>()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    remindAt: timestampTz('remind_at').notNull(),
    firedAt: timestampTz('fired_at'),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('reminders_active_thread_unique')
      .on(table.threadId)
      .where(sql`${table.firedAt} is null`),
    index('reminders_due_idx')
      .on(table.remindAt)
      .where(sql`${table.firedAt} is null`),
  ],
);
