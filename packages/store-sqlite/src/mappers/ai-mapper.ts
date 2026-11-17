import { type AiJob, AiJobSchema, type AiResult, AiResultSchema } from '@relay/shared/domain';
import type { AiJobRow, AiResultRow, aiJobs, aiResults } from '../schema';
import { toTimestamp } from './timestamp';

export const toAiResult = (row: AiResultRow): AiResult =>
  AiResultSchema.parse({
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    sourceMessageId: row.sourceMessageId,
    runner: row.runner,
    output: row.output,
    createdAt: row.createdAt,
  });

export const toAiResultRow = (result: AiResult): typeof aiResults.$inferInsert => ({
  id: result.id,
  userId: result.userId,
  threadId: result.threadId,
  sourceMessageId: result.sourceMessageId,
  kind: result.output.kind,
  runner: result.runner,
  output: result.output,
  createdAt: result.createdAt,
  createdTs: toTimestamp(result.createdAt),
});

export const toAiJob = (row: AiJobRow): AiJob =>
  AiJobSchema.parse({
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    status: row.status,
    runnerLocation: row.runnerLocation,
    runner: row.runner,
    ...(row.model === null ? {} : { model: row.model }),
    input: row.input,
    output: row.output,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const toAiJobRow = (job: AiJob): typeof aiJobs.$inferInsert => ({
  id: job.id,
  userId: job.userId,
  kind: job.kind,
  status: job.status,
  runnerLocation: job.runnerLocation,
  runner: job.runner,
  model: job.model ?? null,
  input: job.input,
  output: job.output,
  error: job.error,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  createdTs: toTimestamp(job.createdAt),
  threadId: 'threadId' in job.input ? job.input.threadId : null,
  sourceMessageId: 'sourceMessageId' in job.input ? (job.input.sourceMessageId ?? null) : null,
});
