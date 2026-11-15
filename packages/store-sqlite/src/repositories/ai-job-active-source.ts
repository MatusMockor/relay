import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { aiJobs } from '../schema';

type AiJobInsert = typeof aiJobs.$inferInsert;

export const sameActiveSource = (job: AiJobInsert): SQL | null => {
  if (job.threadId === null || job.threadId === undefined) {
    return null;
  }
  if (job.sourceMessageId === null || job.sourceMessageId === undefined) {
    return null;
  }
  return (
    and(
      eq(aiJobs.userId, job.userId),
      eq(aiJobs.kind, job.kind),
      eq(aiJobs.threadId, job.threadId),
      eq(aiJobs.sourceMessageId, job.sourceMessageId),
      inArray(aiJobs.status, ['queued', 'running']),
    ) ?? null
  );
};
