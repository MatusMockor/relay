import type { TaskSystemConnectionRecord } from '@relay/engine';
import type { TaskSystemConnectionRow, taskSystemConnections } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

export const toTaskSystemConnectionRecord = (
  row: Omit<TaskSystemConnectionRow, 'credentialsEnvelope'>,
): TaskSystemConnectionRecord => ({
  id: row.id,
  userId: row.userId,
  provider: row.provider,
  label: row.label,
  siteUrl: row.siteUrl,
  accountName: row.accountName,
  externalAccountId: row.externalAccountId,
  status: row.status,
  lastError: row.lastError,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const toTaskSystemConnectionInsert = (
  record: TaskSystemConnectionRecord,
): typeof taskSystemConnections.$inferInsert => ({
  id: record.id,
  userId: record.userId,
  provider: record.provider,
  label: record.label,
  siteUrl: record.siteUrl,
  accountName: record.accountName,
  externalAccountId: record.externalAccountId,
  status: record.status,
  lastError: record.lastError,
  createdAt: toDate(record.createdAt),
  updatedAt: toDate(record.updatedAt),
});
