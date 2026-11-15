import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import { ConflictError, type ScheduledSendRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

const ACTIVE = new Set<ScheduledSend['status']>(['pending', 'sending']);

export class MemoryScheduledSendRepository implements ScheduledSendRepository {
  failMarkSent = 0;

  constructor(private readonly db: MemoryDatabase) {}

  listPending(userId: UserId): Promise<ScheduledSend[]> {
    return Promise.resolve(
      this.all().filter((item) => item.userId === userId && item.status === 'pending'),
    );
  }

  findById(userId: UserId, scheduledSendId: ScheduledSendId): Promise<ScheduledSend | null> {
    const item = this.db.tables.scheduledSends.get(scheduledSendId);
    return Promise.resolve(item?.userId === userId ? item : null);
  }

  listDue(now: string, limit: number): Promise<ScheduledSend[]> {
    return Promise.resolve(
      this.all()
        .filter(
          (item) => item.status === 'pending' && Date.parse(item.scheduledAt) <= Date.parse(now),
        )
        .slice(0, limit),
    );
  }

  create(scheduledSend: ScheduledSend): Promise<ScheduledSend> {
    const duplicate = this.all().some(
      (item) => item.draftId === scheduledSend.draftId && ACTIVE.has(item.status),
    );
    if (duplicate && ACTIVE.has(scheduledSend.status)) {
      return Promise.reject(new ConflictError('The record conflicts with an existing record'));
    }
    this.db.tables.scheduledSends.set(scheduledSend.id, scheduledSend);
    return Promise.resolve(scheduledSend);
  }

  claim(scheduledSendId: ScheduledSendId, claimedAt: string): Promise<boolean> {
    const item = this.db.tables.scheduledSends.get(scheduledSendId);
    if (item?.status !== 'pending') {
      return Promise.resolve(false);
    }
    this.db.tables.scheduledSends.set(scheduledSendId, { ...item, status: 'sending' });
    this.db.tables.scheduledSendClaims.set(scheduledSendId, claimedAt);
    return Promise.resolve(true);
  }

  releaseStaleSending(staleBefore: string, keep: readonly ScheduledSendId[]): Promise<number> {
    const stale = this.all().filter(
      (item) => this.isStaleSending(item, staleBefore) && !keep.includes(item.id),
    );
    stale.forEach((item) => {
      this.write(item.id, { status: 'pending' });
    });
    return Promise.resolve(stale.length);
  }

  markSent(scheduledSendId: ScheduledSendId, sentAt: string, claimedAt: string): Promise<boolean> {
    if (this.failMarkSent > 0) {
      this.failMarkSent -= 1;
      return Promise.reject(new Error('database is locked'));
    }
    return Promise.resolve(
      this.settle(scheduledSendId, claimedAt, { status: 'sent', sentAt, error: null }),
    );
  }

  markFailed(scheduledSendId: ScheduledSendId, error: string, claimedAt: string): Promise<boolean> {
    return Promise.resolve(this.settle(scheduledSendId, claimedAt, { status: 'failed', error }));
  }

  cancel(userId: UserId, scheduledSendId: ScheduledSendId, staleBefore: string): Promise<boolean> {
    const item = this.db.tables.scheduledSends.get(scheduledSendId);
    if (item?.userId !== userId) {
      return Promise.resolve(false);
    }
    if (item.status !== 'pending' && !this.isStaleSending(item, staleBefore)) {
      return Promise.resolve(false);
    }
    this.write(scheduledSendId, { status: 'cancelled' });
    return Promise.resolve(true);
  }

  private settle(id: ScheduledSendId, claimedAt: string, changes: Partial<ScheduledSend>): boolean {
    const item = this.db.tables.scheduledSends.get(id);
    if (item?.status !== 'sending' || this.db.tables.scheduledSendClaims.get(id) !== claimedAt) {
      return false;
    }
    this.write(id, changes);
    return true;
  }

  private isStaleSending(item: ScheduledSend, staleBefore: string): boolean {
    if (item.status !== 'sending') {
      return false;
    }
    const claimedAt = this.db.tables.scheduledSendClaims.get(item.id);
    return claimedAt === undefined || Date.parse(claimedAt) < Date.parse(staleBefore);
  }

  private write(id: ScheduledSendId, changes: Partial<ScheduledSend>): void {
    const item = this.db.tables.scheduledSends.get(id);
    if (item === undefined) {
      return;
    }
    this.db.tables.scheduledSends.set(id, { ...item, ...changes });
    this.db.tables.scheduledSendClaims.delete(id);
  }

  private all(): ScheduledSend[] {
    return [...this.db.tables.scheduledSends.values()];
  }
}
