import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';
import type { ScheduledSendRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryScheduledSendRepository implements ScheduledSendRepository {
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
    this.db.tables.scheduledSends.set(scheduledSend.id, scheduledSend);
    return Promise.resolve(scheduledSend);
  }

  claim(scheduledSendId: ScheduledSendId): Promise<boolean> {
    const item = this.db.tables.scheduledSends.get(scheduledSendId);
    if (item?.status !== 'pending') {
      return Promise.resolve(false);
    }
    this.db.tables.scheduledSends.set(scheduledSendId, { ...item, status: 'sending' });
    return Promise.resolve(true);
  }

  markSent(scheduledSendId: ScheduledSendId, sentAt: string): Promise<void> {
    return this.patch(scheduledSendId, { status: 'sent', sentAt, error: null });
  }

  markFailed(scheduledSendId: ScheduledSendId, error: string): Promise<void> {
    return this.patch(scheduledSendId, { status: 'failed', error });
  }

  cancel(userId: UserId, scheduledSendId: ScheduledSendId): Promise<boolean> {
    const item = this.db.tables.scheduledSends.get(scheduledSendId);
    if (item?.userId !== userId || item.status !== 'pending') {
      return Promise.resolve(false);
    }
    this.db.tables.scheduledSends.set(scheduledSendId, { ...item, status: 'cancelled' });
    return Promise.resolve(true);
  }

  private patch(id: ScheduledSendId, changes: Partial<ScheduledSend>): Promise<void> {
    const item = this.db.tables.scheduledSends.get(id);
    if (item !== undefined) {
      this.db.tables.scheduledSends.set(id, { ...item, ...changes });
    }
    return Promise.resolve();
  }

  private all(): ScheduledSend[] {
    return [...this.db.tables.scheduledSends.values()];
  }
}
