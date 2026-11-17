import type { AiJob } from '@relay/shared/domain';
import type { aiJobs } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type AiJobRow = typeof aiJobs.$inferSelect;
type AiJobInsert = typeof aiJobs.$inferInsert;

export const toAiJob = (row: AiJobRow): AiJob => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind,
  status: row.status,
  runnerLocation: row.runnerLocation,
  runner: row.runner,
  ...(row.model === null ? {} : { model: row.model }),
  ...(row.effort === null ? {} : { effort: row.effort }),
  input: row.input,
  output: row.output,
  error: row.error,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const toAiJobInsert = (job: AiJob): AiJobInsert => ({
  id: job.id,
  userId: job.userId,
  kind: job.kind,
  status: job.status,
  runnerLocation: job.runnerLocation,
  runner: job.runner,
  model: job.model ?? null,
  effort: job.effort ?? null,
  input: job.input,
  output: job.output,
  error: job.error,
  createdAt: toDate(job.createdAt),
  updatedAt: toDate(job.updatedAt),
  threadId: 'threadId' in job.input ? job.input.threadId : null,
  sourceMessageId: 'sourceMessageId' in job.input ? (job.input.sourceMessageId ?? null) : null,
});
