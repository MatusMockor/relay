import type { ScheduledSendRepository } from '@relay/engine';
import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { scheduledSends } from '../../schema';
import { assertOwned } from '../../support/ownership';
import { toDate } from '../../support/timestamps';
import { toScheduledSend, toScheduledSendInsert } from './scheduled-send.mapper';

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
    return this.db.transaction(async (tx) => {
      await assertOwned(tx, 'Account', scheduledSend.userId, scheduledSend.accountId);
      await assertOwned(tx, 'Draft', scheduledSend.userId, scheduledSend.draftId);
      const [row] = await tx
        .insert(scheduledSends)
        .values(toScheduledSendInsert(scheduledSend))
        .returning();
      return row === undefined ? scheduledSend : toScheduledSend(row);
    });
  }

  async claim(scheduledSendId: ScheduledSendId): Promise<boolean> {
    const rows = await this.db
      .update(scheduledSends)
      .set({ status: 'sending' })
      .where(and(eq(scheduledSends.id, scheduledSendId), eq(scheduledSends.status, 'pending')))
      .returning({ id: scheduledSends.id });
    return rows.length > 0;
  }

  async markSent(scheduledSendId: ScheduledSendId, sentAt: string): Promise<void> {
    await this.db
      .update(scheduledSends)
      .set({ status: 'sent', sentAt: toDate(sentAt), error: null })
      .where(eq(scheduledSends.id, scheduledSendId));
  }

  async markFailed(scheduledSendId: ScheduledSendId, error: string): Promise<void> {
    await this.db
      .update(scheduledSends)
      .set({ status: 'failed', error })
      .where(eq(scheduledSends.id, scheduledSendId));
  }

  async cancel(userId: UserId, scheduledSendId: ScheduledSendId): Promise<boolean> {
    const rows = await this.db
      .update(scheduledSends)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(scheduledSends.userId, userId),
          eq(scheduledSends.id, scheduledSendId),
          eq(scheduledSends.status, 'pending'),
        ),
      )
      .returning({ id: scheduledSends.id });
    return rows.length > 0;
  }
}
