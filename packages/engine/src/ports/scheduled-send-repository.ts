import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';

export interface ScheduledSendRepository {
  listPending(userId: UserId): Promise<ScheduledSend[]>;
  findById(userId: UserId, scheduledSendId: ScheduledSendId): Promise<ScheduledSend | null>;
  listDue(now: string, limit: number): Promise<ScheduledSend[]>;
  create(scheduledSend: ScheduledSend): Promise<ScheduledSend>;
  claim(scheduledSendId: ScheduledSendId): Promise<boolean>;
  markSent(scheduledSendId: ScheduledSendId, sentAt: string): Promise<void>;
  markFailed(scheduledSendId: ScheduledSendId, error: string): Promise<void>;
  cancel(userId: UserId, scheduledSendId: ScheduledSendId): Promise<boolean>;
}
