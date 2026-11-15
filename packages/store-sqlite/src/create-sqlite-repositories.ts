import type { MessageAttachmentLookup, Repositories } from '@relay/engine';
import type { SqliteDatabase } from './database/sqlite-database';
import { QueuedExecutor } from './executor/queued-executor';
import type { SqliteExecutor } from './executor/sqlite-executor';
import { SqliteAccountRepository } from './repositories/sqlite-account-repository';
import { SqliteAiJobRepository } from './repositories/sqlite-ai-job-repository';
import { SqliteAiResultRepository } from './repositories/sqlite-ai-result-repository';
import { SqliteDraftRepository } from './repositories/sqlite-draft-repository';
import { SqliteLabelRepository } from './repositories/sqlite-label-repository';
import { SqliteMailboxRepository } from './repositories/sqlite-mailbox-repository';
import { SqliteMessageAttachmentLookup } from './repositories/sqlite-message-attachment-lookup';
import { SqliteMessageRepository } from './repositories/sqlite-message-repository';
import { SqlitePendingWorkRepository } from './repositories/sqlite-pending-work-repository';
import { SqliteReminderRepository } from './repositories/sqlite-reminder-repository';
import { SqliteScheduledSendRepository } from './repositories/sqlite-scheduled-send-repository';
import { SqliteSettingsRepository } from './repositories/sqlite-settings-repository';
import { SqliteSplitRepository } from './repositories/sqlite-split-repository';
import { SqliteSyncStateRepository } from './repositories/sqlite-sync-state-repository';
import { SqliteTaskRepository } from './repositories/sqlite-task-repository';
import { SqliteThreadRepository } from './repositories/threads/sqlite-thread-repository';

export const createRepositoriesWith = (executor: SqliteExecutor): Repositories => ({
  accounts: new SqliteAccountRepository(executor),
  mailboxes: new SqliteMailboxRepository(executor),
  messages: new SqliteMessageRepository(executor),
  threads: new SqliteThreadRepository(executor),
  labels: new SqliteLabelRepository(executor),
  splits: new SqliteSplitRepository(executor),
  tasks: new SqliteTaskRepository(executor),
  reminders: new SqliteReminderRepository(executor),
  drafts: new SqliteDraftRepository(executor),
  scheduledSends: new SqliteScheduledSendRepository(executor),
  settings: new SqliteSettingsRepository(executor),
  aiResults: new SqliteAiResultRepository(executor),
  aiJobs: new SqliteAiJobRepository(executor),
  syncStates: new SqliteSyncStateRepository(executor),
  pendingWork: new SqlitePendingWorkRepository(executor),
});

export const createSqliteRepositories = (database: SqliteDatabase): Repositories =>
  createRepositoriesWith(new QueuedExecutor(database));

export const createSqliteMessageAttachmentLookup = (
  database: SqliteDatabase,
): MessageAttachmentLookup => new SqliteMessageAttachmentLookup(new QueuedExecutor(database));
