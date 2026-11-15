import { and, eq, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import { aiJobs } from '../../schema';

export const claimableAt = (now: Date): SQL =>
  or(
    eq(aiJobs.status, 'queued'),
    and(eq(aiJobs.status, 'running'), isNotNull(aiJobs.leaseUntil), lt(aiJobs.leaseUntil, now)),
  ) as SQL;
