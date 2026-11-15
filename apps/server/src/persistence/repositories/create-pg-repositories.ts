import type { ServerRepositories } from '../../core/ports/server-unit-of-work';
import type { DbExecutor } from '../database/database';
import { PgAccountRepository } from './accounts/pg-account-repository';
import { PgAiJobRepository } from './ai-jobs/pg-ai-job-repository';
import { PgAiResultRepository } from './ai-results/pg-ai-result-repository';
import { PgDeviceRepository } from './devices/pg-device-repository';
import { PgDraftRepository } from './drafts/pg-draft-repository';
import { PgLabelRepository } from './labels/pg-label-repository';
import { PgMailboxRepository } from './mailboxes/pg-mailbox-repository';
import { PgMessageRepository } from './messages/pg-message-repository';
import { PgPendingWorkRepository } from './pending-work/pg-pending-work-repository';
import { PgRefreshTokenRepository } from './refresh-tokens/pg-refresh-token-repository';
import { PgReminderRepository } from './reminders/pg-reminder-repository';
import { PgScheduledSendRepository } from './scheduled-sends/pg-scheduled-send-repository';
import { PgSettingsRepository } from './settings/pg-settings-repository';
import { PgSplitRepository } from './splits/pg-split-repository';
import { PgSyncStateRepository } from './sync-states/pg-sync-state-repository';
import { PgTaskRepository } from './tasks/pg-task-repository';
import { PgThreadRepository } from './threads/pg-thread-repository';
import { PgUserRepository } from './users/pg-user-repository';

export const createPgRepositories = (db: DbExecutor): ServerRepositories => ({
  accounts: new PgAccountRepository(db),
  mailboxes: new PgMailboxRepository(db),
  messages: new PgMessageRepository(db),
  threads: new PgThreadRepository(db),
  labels: new PgLabelRepository(db),
  splits: new PgSplitRepository(db),
  tasks: new PgTaskRepository(db),
  reminders: new PgReminderRepository(db),
  drafts: new PgDraftRepository(db),
  scheduledSends: new PgScheduledSendRepository(db),
  settings: new PgSettingsRepository(db),
  aiResults: new PgAiResultRepository(db),
  aiJobs: new PgAiJobRepository(db),
  syncStates: new PgSyncStateRepository(db),
  pendingWork: new PgPendingWorkRepository(db),
  users: new PgUserRepository(db),
  devices: new PgDeviceRepository(db),
  refreshTokens: new PgRefreshTokenRepository(db),
});
