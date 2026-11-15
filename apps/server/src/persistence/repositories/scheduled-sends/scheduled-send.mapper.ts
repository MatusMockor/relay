import type { ScheduledSend } from '@relay/shared/domain';
import type { scheduledSends } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

type ScheduledSendRow = typeof scheduledSends.$inferSelect;
type ScheduledSendInsert = typeof scheduledSends.$inferInsert;

export const toScheduledSend = (row: ScheduledSendRow): ScheduledSend => ({
  id: row.id,
  userId: row.userId,
  accountId: row.accountId,
  draftId: row.draftId,
  scheduledAt: toIso(row.scheduledAt),
  status: row.status,
  error: row.error,
  sentAt: toIsoOrNull(row.sentAt),
  createdAt: toIso(row.createdAt),
});

export const toScheduledSendInsert = (item: ScheduledSend): ScheduledSendInsert => ({
  id: item.id,
  userId: item.userId,
  accountId: item.accountId,
  draftId: item.draftId,
  scheduledAt: toDate(item.scheduledAt),
  status: item.status,
  error: item.error,
  sentAt: toDateOrNull(item.sentAt),
  createdAt: toDate(item.createdAt),
});
