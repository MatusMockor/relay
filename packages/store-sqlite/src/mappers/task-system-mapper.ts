import type { TaskSystemConnectionRecord } from '@relay/engine';
import {
  TaskSystemConnectionIdSchema,
  TaskSystemConnectionStatusSchema,
  TaskSystemProviderSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import type { TaskSystemConnectionRow } from '../schema';

export const toTaskSystemConnectionRecord = (
  row: TaskSystemConnectionRow,
): TaskSystemConnectionRecord => ({
  id: TaskSystemConnectionIdSchema.parse(row.id),
  userId: UserIdSchema.parse(row.userId),
  provider: TaskSystemProviderSchema.parse(row.provider),
  label: row.label,
  siteUrl: row.siteUrl,
  accountName: row.accountName,
  externalAccountId: row.externalAccountId,
  status: TaskSystemConnectionStatusSchema.parse(row.status),
  lastError: row.lastError,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toTaskSystemConnectionRow = (
  record: TaskSystemConnectionRecord,
): TaskSystemConnectionRow => ({
  id: record.id,
  userId: record.userId,
  provider: record.provider,
  label: record.label,
  siteUrl: record.siteUrl,
  accountName: record.accountName,
  externalAccountId: record.externalAccountId,
  status: record.status,
  lastError: record.lastError,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
