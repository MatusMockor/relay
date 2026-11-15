import type { Reminder, ReminderId, ThreadId, UserId } from '@relay/shared/domain';
import type { ReminderRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryReminderRepository implements ReminderRepository {
  constructor(private readonly db: MemoryDatabase) {}

  findActiveByThread(userId: UserId, threadId: ThreadId): Promise<Reminder | null> {
    const match = this.all().find(
      (reminder) =>
        reminder.userId === userId && reminder.threadId === threadId && reminder.firedAt === null,
    );
    return Promise.resolve(match ?? null);
  }

  listDue(now: string, limit: number): Promise<Reminder[]> {
    return Promise.resolve(
      this.all()
        .filter(
          (reminder) =>
            reminder.firedAt === null && Date.parse(reminder.remindAt) <= Date.parse(now),
        )
        .sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt))
        .slice(0, limit),
    );
  }

  upsert(reminder: Reminder): Promise<Reminder> {
    this.db.tables.reminders.set(reminder.id, reminder);
    return Promise.resolve(reminder);
  }

  markFired(reminderId: ReminderId, firedAt: string): Promise<void> {
    const reminder = this.db.tables.reminders.get(reminderId);
    if (reminder !== undefined) {
      this.db.tables.reminders.set(reminderId, { ...reminder, firedAt });
    }
    return Promise.resolve();
  }

  delete(userId: UserId, reminderId: ReminderId): Promise<boolean> {
    if (this.db.tables.reminders.get(reminderId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    return Promise.resolve(this.db.tables.reminders.delete(reminderId));
  }

  private all(): Reminder[] {
    return [...this.db.tables.reminders.values()];
  }
}
