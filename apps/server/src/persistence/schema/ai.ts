import type {
  AiJobId,
  AiJobInput,
  AiJobStatus,
  AiOutput,
  AiResultId,
  AiRunnerKind,
  AiRunnerLocation,
  AiTaskKind,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';
import { threads } from './threads';
import { users } from './users';

export const aiResults = pgTable(
  'ai_results',
  {
    id: text('id').$type<AiResultId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id')
      .$type<ThreadId>()
      .references(() => threads.id, { onDelete: 'cascade' }),
    sourceMessageId: text('source_message_id').$type<MessageId>(),
    kind: text('kind').$type<AiTaskKind>().notNull(),
    runner: text('runner').$type<AiRunnerKind>().notNull(),
    output: jsonb('output').$type<AiOutput>().notNull(),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [
    index('ai_results_lookup_idx').on(
      table.userId,
      table.threadId,
      table.kind,
      table.createdAt.desc(),
    ),
  ],
);

export const aiJobs = pgTable(
  'ai_jobs',
  {
    id: text('id').$type<AiJobId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<AiTaskKind>().notNull(),
    status: text('status').$type<AiJobStatus>().notNull(),
    runnerLocation: text('runner_location').$type<AiRunnerLocation>().notNull(),
    runner: text('runner').$type<AiRunnerKind>().notNull(),
    input: jsonb('input').$type<AiJobInput>().notNull(),
    output: jsonb('output').$type<AiOutput>(),
    error: text('error'),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
    threadId: text('thread_id').$type<ThreadId>(),
    sourceMessageId: text('source_message_id').$type<MessageId>(),
    claimedBy: text('claimed_by'),
    leaseUntil: timestampTz('lease_until'),
  },
  (table) => [
    index('ai_jobs_user_idx').on(table.userId, table.createdAt.desc()),
    index('ai_jobs_queue_idx').on(table.runnerLocation, table.status, table.createdAt),
    uniqueIndex('ai_jobs_active_source_idx')
      .on(table.userId, table.threadId, table.kind, table.sourceMessageId)
      .where(sql`status in ('queued', 'running') and source_message_id is not null`),
  ],
);
