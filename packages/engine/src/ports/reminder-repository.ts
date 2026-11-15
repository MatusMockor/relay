import type { Reminder, ReminderId, ThreadId, UserId } from '@relay/shared/domain';

export interface ReminderRepository {
  findActiveByThread(userId: UserId, threadId: ThreadId): Promise<Reminder | null>;
  listDue(now: string, limit: number): Promise<Reminder[]>;
  upsert(reminder: Reminder): Promise<Reminder>;
  markFired(reminderId: ReminderId, firedAt: string): Promise<void>;
  delete(userId: UserId, reminderId: ReminderId): Promise<boolean>;
}
