import type { ScheduledSend, ScheduledSendId, UserId } from '@relay/shared/domain';

export interface ScheduledSendRepository {
  listPending(userId: UserId): Promise<ScheduledSend[]>;
  findById(userId: UserId, scheduledSendId: ScheduledSendId): Promise<ScheduledSend | null>;
  listDue(now: string, limit: number): Promise<ScheduledSend[]>;
  create(scheduledSend: ScheduledSend): Promise<ScheduledSend>;
  claim(scheduledSendId: ScheduledSendId, claimedAt: string): Promise<boolean>;
  releaseStaleSending(staleBefore: string, keep: readonly ScheduledSendId[]): Promise<number>;
  markSent(scheduledSendId: ScheduledSendId, sentAt: string, claimedAt: string): Promise<boolean>;
  markFailed(scheduledSendId: ScheduledSendId, error: string, claimedAt: string): Promise<boolean>;
  cancel(userId: UserId, scheduledSendId: ScheduledSendId, staleBefore: string): Promise<boolean>;
}
