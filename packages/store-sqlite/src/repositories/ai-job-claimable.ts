import { and, eq, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import { aiJobs } from '../schema';

export const claimableAt = (nowTs: number): SQL =>
  or(
    eq(aiJobs.status, 'queued'),
    and(
      eq(aiJobs.status, 'running'),
      isNotNull(aiJobs.leaseUntilTs),
      lt(aiJobs.leaseUntilTs, nowTs),
    ),
  ) as SQL;
