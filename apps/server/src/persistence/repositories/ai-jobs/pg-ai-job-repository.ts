import type {
  AiJobClaim,
  AiJobEnqueueResult,
  AiJobRepository,
  AiJobUpdate,
  QueuedAiJobQuery,
} from '@relay/engine';
import type { AiJob, AiJobId, AiRunnerLocation, UserId } from '@relay/shared/domain';
import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { aiJobs } from '../../schema';
import { toDate } from '../../support/timestamps';
import { sameActiveSource } from './ai-job-active-source';
import { claimableAt } from './ai-job-claimable';
import { toAiJob, toAiJobInsert } from './ai-job.mapper';

export class PgAiJobRepository implements AiJobRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(userId: UserId, jobId: AiJobId): Promise<AiJob | null> {
    const [row] = await this.db
      .select()
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, userId), eq(aiJobs.id, jobId)));
    return row === undefined ? null : toAiJob(row);
  }

  async create(job: AiJob, claim?: AiJobClaim): Promise<AiJob> {
    const [row] = await this.db
      .insert(aiJobs)
      .values({
        ...toAiJobInsert(job),
        ...(claim === undefined
          ? {}
          : {
              claimedBy: claim.owner,
              leaseUntil: toDate(claim.leaseUntil),
              sourceMessageId: null,
            }),
      })
      .returning();
    return row === undefined ? job : toAiJob(row);
  }

  async update(jobId: AiJobId, update: AiJobUpdate): Promise<AiJob | null> {
    const [row] = await this.db
      .update(aiJobs)
      .set({
        status: update.status,
        updatedAt: toDate(update.updatedAt),
        ...(update.output === undefined ? {} : { output: update.output }),
        ...(update.error === undefined ? {} : { error: update.error }),
        ...(update.leaseUntil === undefined ? {} : { leaseUntil: toDate(update.leaseUntil) }),
      })
      .where(
        and(
          eq(aiJobs.id, jobId),
          update.owner === undefined ? undefined : eq(aiJobs.claimedBy, update.owner),
          update.fromStatus === undefined ? undefined : eq(aiJobs.status, update.fromStatus),
        ),
      )
      .returning();
    return row === undefined ? null : toAiJob(row);
  }

  async claim(jobId: AiJobId, claim: AiJobClaim): Promise<AiJob | null> {
    const now = toDate(claim.now);
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: aiJobs.id })
        .from(aiJobs)
        .where(
          and(
            eq(aiJobs.id, jobId),
            claimableAt(now),
            claim.location === undefined ? undefined : eq(aiJobs.runnerLocation, claim.location),
          ),
        )
        .for('update', { skipLocked: true });
      if (target === undefined) {
        return null;
      }
      const [row] = await tx
        .update(aiJobs)
        .set({
          status: 'running',
          updatedAt: now,
          claimedBy: claim.owner,
          leaseUntil: toDate(claim.leaseUntil),
        })
        .where(eq(aiJobs.id, target.id))
        .returning();
      return row === undefined ? null : toAiJob(row);
    });
  }

  async listQueued(query: QueuedAiJobQuery): Promise<AiJob[]> {
    const rows = await this.db
      .select()
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.runnerLocation, query.location),
          query.userId === undefined ? undefined : eq(aiJobs.userId, query.userId),
          claimableAt(toDate(query.now)),
        ),
      )
      .orderBy(asc(aiJobs.createdAt), asc(aiJobs.id))
      .limit(query.limit);
    return rows.map(toAiJob);
  }

  async enqueueIfAbsent(job: AiJob): Promise<AiJobEnqueueResult> {
    const values = toAiJobInsert(job);
    const [created] = await this.db.insert(aiJobs).values(values).onConflictDoNothing().returning();
    if (created !== undefined) {
      return { job: toAiJob(created), created: true };
    }
    const condition = sameActiveSource(values);
    if (condition === null) {
      return { job: null, created: false };
    }
    const [active] = await this.db.select().from(aiJobs).where(condition).limit(1);
    return { job: active === undefined ? null : toAiJob(active), created: false };
  }

  async lockResultSlot(job: AiJob): Promise<void> {
    const { threadId } = toAiJobInsert(job);
    const slot = `ai-result:${job.userId}:${threadId ?? ''}:${job.kind}`;
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${slot}, 0))`);
  }

  async hasNewerDone(job: AiJob): Promise<boolean> {
    const { threadId } = toAiJobInsert(job);
    const [row] = await this.db
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
          gt(aiJobs.createdAt, toDate(job.createdAt)),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async relocateQueued(
    userId: UserId,
    location: AiRunnerLocation,
    updatedAt: string,
  ): Promise<AiJob[]> {
    const rows = await this.db
      .update(aiJobs)
      .set({ runnerLocation: location, updatedAt: toDate(updatedAt) })
      .where(
        and(
          eq(aiJobs.userId, userId),
          eq(aiJobs.status, 'queued'),
          ne(aiJobs.runnerLocation, location),
        ),
      )
      .returning();
    return rows.map(toAiJob);
  }
}
