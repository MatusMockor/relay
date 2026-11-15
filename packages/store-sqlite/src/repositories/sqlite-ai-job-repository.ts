import type {
  AiJobClaim,
  AiJobEnqueueResult,
  AiJobRepository,
  AiJobUpdate,
  QueuedAiJobQuery,
} from '@relay/engine';
import type { AiJob, AiJobId, AiRunnerLocation, UserId } from '@relay/shared/domain';
import { and, asc, eq, gt, isNull, ne } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toAiJob, toAiJobRow } from '../mappers/ai-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { aiJobs } from '../schema';
import { sameActiveSource } from './ai-job-active-source';
import { claimableAt } from './ai-job-claimable';

export class SqliteAiJobRepository implements AiJobRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findById(userId: UserId, jobId: AiJobId): Promise<AiJob | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(aiJobs)
        .where(and(eq(aiJobs.userId, userId), eq(aiJobs.id, jobId)))
        .get();
      return row === undefined ? null : toAiJob(row);
    });
  }

  create(job: AiJob, claim?: AiJobClaim): Promise<AiJob> {
    return this.executor.execute((db) => {
      db.insert(aiJobs)
        .values({
          ...toAiJobRow(job),
          ...(claim === undefined
            ? {}
            : {
                claimedBy: claim.owner,
                leaseUntilTs: toTimestamp(claim.leaseUntil),
                sourceMessageId: null,
              }),
        })
        .run();
      return job;
    });
  }

  update(jobId: AiJobId, update: AiJobUpdate): Promise<AiJob | null> {
    return this.executor.execute((db) => {
      const [row] = db
        .update(aiJobs)
        .set({
          status: update.status,
          updatedAt: update.updatedAt,
          ...(update.output === undefined ? {} : { output: update.output }),
          ...(update.error === undefined ? {} : { error: update.error }),
          ...(update.leaseUntil === undefined
            ? {}
            : { leaseUntilTs: toTimestamp(update.leaseUntil) }),
        })
        .where(
          and(
            eq(aiJobs.id, jobId),
            update.owner === undefined ? undefined : eq(aiJobs.claimedBy, update.owner),
            update.fromStatus === undefined ? undefined : eq(aiJobs.status, update.fromStatus),
          ),
        )
        .returning()
        .all();
      return row === undefined ? null : toAiJob(row);
    });
  }

  claim(jobId: AiJobId, claim: AiJobClaim): Promise<AiJob | null> {
    return this.executor.execute((db) => {
      const [row] = db
        .update(aiJobs)
        .set({
          status: 'running',
          updatedAt: claim.now,
          claimedBy: claim.owner,
          leaseUntilTs: toTimestamp(claim.leaseUntil),
        })
        .where(
          and(
            eq(aiJobs.id, jobId),
            claimableAt(toTimestamp(claim.now)),
            claim.location === undefined ? undefined : eq(aiJobs.runnerLocation, claim.location),
          ),
        )
        .returning()
        .all();
      return row === undefined ? null : toAiJob(row);
    });
  }

  listQueued(query: QueuedAiJobQuery): Promise<AiJob[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(aiJobs)
        .where(
          and(
            eq(aiJobs.runnerLocation, query.location),
            query.userId === undefined ? undefined : eq(aiJobs.userId, query.userId),
            claimableAt(toTimestamp(query.now)),
          ),
        )
        .orderBy(asc(aiJobs.createdTs), asc(aiJobs.id))
        .limit(query.limit)
        .all()
        .map(toAiJob),
    );
  }

  enqueueIfAbsent(job: AiJob): Promise<AiJobEnqueueResult> {
    const values = toAiJobRow(job);
    return this.executor.execute((db) => {
      const [created] = db.insert(aiJobs).values(values).onConflictDoNothing().returning().all();
      if (created !== undefined) {
        return { job: toAiJob(created), created: true };
      }
      const condition = sameActiveSource(values);
      const active =
        condition === null ? undefined : db.select().from(aiJobs).where(condition).get();
      return { job: active === undefined ? null : toAiJob(active), created: false };
    });
  }

  lockResultSlot(): Promise<void> {
    return Promise.resolve();
  }

  hasNewerDone(job: AiJob): Promise<boolean> {
    const { threadId } = toAiJobRow(job);
    return this.executor.execute((db) => {
      const row = db
        .select({ id: aiJobs.id })
        .from(aiJobs)
        .where(
          and(
            eq(aiJobs.userId, job.userId),
            eq(aiJobs.kind, job.kind),
            threadId === null || threadId === undefined
              ? isNull(aiJobs.threadId)
              : eq(aiJobs.threadId, threadId),
            eq(aiJobs.status, 'done'),
            gt(aiJobs.createdTs, toTimestamp(job.createdAt)),
          ),
        )
        .get();
      return row !== undefined;
    });
  }

  relocateQueued(userId: UserId, location: AiRunnerLocation, updatedAt: string): Promise<AiJob[]> {
    return this.executor.execute((db) =>
      db
        .update(aiJobs)
        .set({ runnerLocation: location, updatedAt })
        .where(
          and(
            eq(aiJobs.userId, userId),
            eq(aiJobs.status, 'queued'),
            ne(aiJobs.runnerLocation, location),
          ),
        )
        .returning()
        .all()
        .map(toAiJob),
    );
  }
}
