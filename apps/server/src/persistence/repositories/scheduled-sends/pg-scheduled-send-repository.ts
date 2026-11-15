import { ConflictError, type ScheduledSendRepository } from '@relay/engine';
import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, lt, lte, notInArray, or } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { scheduledSends } from '../../schema';
import { assertOwned } from '../../support/ownership';
import { isUniqueViolation } from '../../support/postgres-errors';
import { toDate } from '../../support/timestamps';
import { toScheduledSend, toScheduledSendInsert } from './scheduled-send.mapper';

const staleSending = (staleBefore: string) =>
  and(
    eq(scheduledSends.status, 'sending'),
    or(isNull(scheduledSends.claimedAt), lt(scheduledSends.claimedAt, toDate(staleBefore))),
  );

const claimedBy = (scheduledSendId: ScheduledSendId, claimedAt: string) =>
  and(
    eq(scheduledSends.id, scheduledSendId),
    eq(scheduledSends.status, 'sending'),
    eq(scheduledSends.claimedAt, toDate(claimedAt)),
  );

export class PgScheduledSendRepository implements ScheduledSendRepository {
  constructor(private readonly db: DbExecutor) {}

  async listPending(userId: UserId): Promise<ScheduledSend[]> {
    const rows = await this.db
      .select()
      .from(scheduledSends)
      .where(and(eq(scheduledSends.userId, userId), eq(scheduledSends.status, 'pending')))
      .orderBy(asc(scheduledSends.scheduledAt), asc(scheduledSends.id));
    return rows.map(toScheduledSend);
  }

  async findById(userId: UserId, scheduledSendId: ScheduledSendId): Promise<ScheduledSend | null> {
    const [row] = await this.db
      .select()
      .from(scheduledSends)
      .where(and(eq(scheduledSends.userId, userId), eq(scheduledSends.id, scheduledSendId)));
    return row === undefined ? null : toScheduledSend(row);
  }

  async listDue(now: string, limit: number): Promise<ScheduledSend[]> {
    const rows = await this.db
      .select()
      .from(scheduledSends)
      .where(
        and(eq(scheduledSends.status, 'pending'), lte(scheduledSends.scheduledAt, toDate(now))),
      )
      .orderBy(asc(scheduledSends.scheduledAt), asc(scheduledSends.id))
      .limit(limit);
    return rows.map(toScheduledSend);
  }

  async create(scheduledSend: ScheduledSend): Promise<ScheduledSend> {
    try {
      return await this.db.transaction(async (tx) => {
        await assertOwned(tx, 'Account', scheduledSend.userId, scheduledSend.accountId);
        await assertOwned(tx, 'Draft', scheduledSend.userId, scheduledSend.draftId);
        const [row] = await tx
          .insert(scheduledSends)
          .values(toScheduledSendInsert(scheduledSend))
          .returning();
        return row === undefined ? scheduledSend : toScheduledSend(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('The draft already has a scheduled send', { cause: error });
      }
      throw error;
    }
  }

  async claim(scheduledSendId: ScheduledSendId, claimedAt: string): Promise<boolean> {
    const rows = await this.db
      .update(scheduledSends)
      .set({
        status: 'sending',
        claimedAt: toDate(claimedAt),
      })
      .where(and(eq(scheduledSends.id, scheduledSendId), eq(scheduledSends.status, 'pending')))
      .returning({ id: scheduledSends.id });
    return rows.length > 0;
  }

  async releaseStaleSending(
    staleBefore: string,
    keep: readonly ScheduledSendId[],
  ): Promise<number> {
    const rows = await this.db
      .update(scheduledSends)
      .set({ status: 'pending', claimedAt: null })
      .where(
        and(
          staleSending(staleBefore),
          keep.length === 0 ? undefined : notInArray(scheduledSends.id, [...keep]),
        ),
      )
      .returning({ id: scheduledSends.id });
    return rows.length;
  }

  async markSent(
    scheduledSendId: ScheduledSendId,
    sentAt: string,
    claimedAt: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(scheduledSends)
      .set({ status: 'sent', sentAt: toDate(sentAt), error: null, claimedAt: null })
      .where(claimedBy(scheduledSendId, claimedAt))
      .returning({ id: scheduledSends.id });
    return rows.length > 0;
  }

  async markFailed(
    scheduledSendId: ScheduledSendId,
    error: string,
    claimedAt: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(scheduledSends)
      .set({ status: 'failed', error, claimedAt: null })
      .where(claimedBy(scheduledSendId, claimedAt))
      .returning({ id: scheduledSends.id });
    return rows.length > 0;
  }

  async cancel(
    userId: UserId,
    scheduledSendId: ScheduledSendId,
    staleBefore: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(scheduledSends)
      .set({ status: 'cancelled', claimedAt: null })
      .where(
        and(
          eq(scheduledSends.userId, userId),
          eq(scheduledSends.id, scheduledSendId),
          or(eq(scheduledSends.status, 'pending'), staleSending(staleBefore)),
        ),
      )
      .returning({ id: scheduledSends.id });
    return rows.length > 0;
  }
}
