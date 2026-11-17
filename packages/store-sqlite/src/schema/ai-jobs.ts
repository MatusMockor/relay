import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const aiJobs = sqliteTable(
  'ai_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    runnerLocation: text('runner_location').notNull(),
    runner: text('runner').notNull(),
    model: text('model'),
    effort: text('effort'),
    input: text('input', { mode: 'json' }).notNull(),
    output: text('output', { mode: 'json' }),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdTs: integer('created_ts').notNull().default(0),
    threadId: text('thread_id'),
    sourceMessageId: text('source_message_id'),
    claimedBy: text('claimed_by'),
    leaseUntilTs: integer('lease_until_ts'),
  },
  (table) => [
    index('ai_jobs_user_idx').on(table.userId, table.createdAt),
    index('ai_jobs_queue_idx').on(table.runnerLocation, table.status, table.createdTs),
    uniqueIndex('ai_jobs_active_source_idx')
      .on(table.userId, table.threadId, table.kind, table.sourceMessageId)
      .where(sql`status in ('queued', 'running') and source_message_id is not null`),
  ],
);

export type AiJobRow = typeof aiJobs.$inferSelect;
