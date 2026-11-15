import type { ScheduledSendRepository } from '@relay/engine';
import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { and, asc, eq, lte } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toScheduledSend, toScheduledSendRow } from '../mappers/scheduled-send-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { assertPageLimit } from '../pagination/page-limit';
import { scheduledSends } from '../schema';

const isPending = eq(scheduledSends.status, 'pending');

export class SqliteScheduledSendRepository implements ScheduledSendRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listPending(userId: UserId): Promise<ScheduledSend[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(scheduledSends)
        .where(and(eq(scheduledSends.userId, userId), isPending))
        .orderBy(asc(scheduledSends.scheduledTs), asc(scheduledSends.id))
        .all()
        .map(toScheduledSend),
    );
  }

  findById(userId: UserId, scheduledSendId: ScheduledSendId): Promise<ScheduledSend | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(scheduledSends)
        .where(and(eq(scheduledSends.userId, userId), eq(scheduledSends.id, scheduledSendId)))
        .get();
      return row === undefined ? null : toScheduledSend(row);
    });
  }

  listDue(now: string, limit: number): Promise<ScheduledSend[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(scheduledSends)
        .where(and(isPending, lte(scheduledSends.scheduledTs, toTimestamp(now))))
        .orderBy(asc(scheduledSends.scheduledTs), asc(scheduledSends.id))
        .limit(assertPageLimit(limit))
        .all()
        .map(toScheduledSend),
    );
  }

  create(scheduledSend: ScheduledSend): Promise<ScheduledSend> {
    return this.executor.execute((db) => {
      db.insert(scheduledSends).values(toScheduledSendRow(scheduledSend)).run();
      return scheduledSend;
    });
  }

  claim(scheduledSendId: ScheduledSendId): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'sending' })
          .where(and(eq(scheduledSends.id, scheduledSendId), isPending))
          .run().changes > 0,
    );
  }

  markSent(scheduledSendId: ScheduledSendId, sentAt: string): Promise<void> {
    return this.executor.execute((db) => {
      db.update(scheduledSends)
        .set({ status: 'sent', sentAt, error: null })
        .where(eq(scheduledSends.id, scheduledSendId))
        .run();
    });
  }

  markFailed(scheduledSendId: ScheduledSendId, error: string): Promise<void> {
    return this.executor.execute((db) => {
      db.update(scheduledSends)
        .set({ status: 'failed', error })
        .where(eq(scheduledSends.id, scheduledSendId))
        .run();
    });
  }

  cancel(userId: UserId, scheduledSendId: ScheduledSendId): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'cancelled' })
          .where(
            and(
              eq(scheduledSends.userId, userId),
              eq(scheduledSends.id, scheduledSendId),
              isPending,
            ),
          )
          .run().changes > 0,
    );
  }
}
