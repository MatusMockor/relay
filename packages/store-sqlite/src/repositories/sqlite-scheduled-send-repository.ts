import type { ScheduledSendRepository } from '@relay/engine';
import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { and, asc, eq, lte, notInArray, or } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toScheduledSend, toScheduledSendRow } from '../mappers/scheduled-send-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { assertPageLimit } from '../pagination/page-limit';
import { scheduledSends } from '../schema';
import { leaseStaleBefore } from './stale-lease';

const isPending = eq(scheduledSends.status, 'pending');

const isStaleSending = (staleBefore: string) =>
  and(
    eq(scheduledSends.status, 'sending'),
    leaseStaleBefore(scheduledSends.claimedTs, scheduledSends.renewedTs, staleBefore),
  );

const claimedBy = (scheduledSendId: ScheduledSendId, claimedAt: string) =>
  and(
    eq(scheduledSends.id, scheduledSendId),
    eq(scheduledSends.status, 'sending'),
    eq(scheduledSends.claimedTs, toTimestamp(claimedAt)),
  );

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

  claim(scheduledSendId: ScheduledSendId, claimedAt: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'sending', claimedTs: toTimestamp(claimedAt), renewedTs: null })
          .where(and(eq(scheduledSends.id, scheduledSendId), isPending))
          .run().changes > 0,
    );
  }

  renew(scheduledSendId: ScheduledSendId, claimedAt: string, renewedAt: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ renewedTs: toTimestamp(renewedAt) })
          .where(claimedBy(scheduledSendId, claimedAt))
          .run().changes > 0,
    );
  }

  releaseStaleSending(staleBefore: string, keep: readonly ScheduledSendId[]): Promise<number> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'pending', claimedTs: null, renewedTs: null })
          .where(
            and(
              isStaleSending(staleBefore),
              keep.length === 0 ? undefined : notInArray(scheduledSends.id, [...keep]),
            ),
          )
          .run().changes,
    );
  }

  markSent(scheduledSendId: ScheduledSendId, sentAt: string, claimedAt: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'sent', sentAt, error: null, claimedTs: null, renewedTs: null })
          .where(claimedBy(scheduledSendId, claimedAt))
          .run().changes > 0,
    );
  }

  markFailed(scheduledSendId: ScheduledSendId, error: string, claimedAt: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'failed', error, claimedTs: null, renewedTs: null })
          .where(claimedBy(scheduledSendId, claimedAt))
          .run().changes > 0,
    );
  }

  cancel(userId: UserId, scheduledSendId: ScheduledSendId, staleBefore: string): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(scheduledSends)
          .set({ status: 'cancelled', claimedTs: null, renewedTs: null })
          .where(
            and(
              eq(scheduledSends.userId, userId),
              eq(scheduledSends.id, scheduledSendId),
              or(isPending, isStaleSending(staleBefore)),
            ),
          )
          .run().changes > 0,
    );
  }
}
