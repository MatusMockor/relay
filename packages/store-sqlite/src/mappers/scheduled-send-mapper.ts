import { type ScheduledSend, ScheduledSendSchema } from '@relay/shared/domain';
import type { ScheduledSendRow, scheduledSends } from '../schema';
import { toTimestamp } from './timestamp';

export const toScheduledSend = (row: ScheduledSendRow): ScheduledSend =>
  ScheduledSendSchema.parse({
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    draftId: row.draftId,
    scheduledAt: row.scheduledAt,
    status: row.status,
    error: row.error,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  });

export const toScheduledSendRow = (send: ScheduledSend): typeof scheduledSends.$inferInsert => ({
  id: send.id,
  userId: send.userId,
  accountId: send.accountId,
  draftId: send.draftId,
  scheduledAt: send.scheduledAt,
  scheduledTs: toTimestamp(send.scheduledAt),
  status: send.status,
  error: send.error,
  sentAt: send.sentAt,
  createdAt: send.createdAt,
});
