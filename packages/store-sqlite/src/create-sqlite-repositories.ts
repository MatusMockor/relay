import type {
  AttachmentReferenceRepository,
  HistoryBackfillRepository,
  MessageUidLookup,
  MessageAttachmentLookup,
  MessageBodyRepairRepository,
  MessageBodyStore,
  Repositories,
} from '@relay/engine';
import type { SqliteDatabase } from './database/sqlite-database';
import { QueuedExecutor } from './executor/queued-executor';
import type { SqliteExecutor } from './executor/sqlite-executor';
import { SqliteAccountRepository } from './repositories/sqlite-account-repository';
import { SqliteAiJobRepository } from './repositories/sqlite-ai-job-repository';
import { SqliteAiResultRepository } from './repositories/sqlite-ai-result-repository';
import { SqliteAttachmentReferenceRepository } from './repositories/sqlite-attachment-reference-repository';
import { SqliteAutomationRepository } from './repositories/sqlite-automation-repository';
import { SqliteAutomationRunRepository } from './repositories/sqlite-automation-run-repository';
import { SqliteAutomationActivityRepository } from './repositories/sqlite-automation-activity-repository';
import { SqliteCalendarEventRepository } from './repositories/sqlite-calendar-event-repository';
import { SqliteCalendarSubscriptionRepository } from './repositories/sqlite-calendar-subscription-repository';
import { SqliteDraftRepository } from './repositories/sqlite-draft-repository';
import { SqliteHistoryBackfillRepository } from './repositories/sqlite-history-backfill-repository';
import { SqliteMessageUidLookup } from './repositories/sqlite-message-uid-lookup';
import { SqliteMessageBodyStore } from './repositories/sqlite-message-body-store';
import { SqliteGoogleCalendarRepository } from './repositories/sqlite-google-calendar-repository';
import { SqliteGoogleConnectionRepository } from './repositories/sqlite-google-connection-repository';
import { SqliteGoogleEventRepository } from './repositories/sqlite-google-event-repository';
import { SqliteAutomationCandidateRepository } from './repositories/sqlite-automation-candidate-repository';
import { SqliteInviteCandidateRepository } from './repositories/sqlite-invite-candidate-repository';
import { SqliteLabelRepository } from './repositories/sqlite-label-repository';
import { SqliteMailboxRepository } from './repositories/sqlite-mailbox-repository';
import { SqliteMessageAttachmentLookup } from './repositories/sqlite-message-attachment-lookup';
import { SqliteMessageBodyRepairRepository } from './repositories/sqlite-message-body-repair-repository';
import { SqliteEmailIdResolutions } from './repositories/merges/sqlite-email-id-resolutions';
import { SqliteMessageMerges } from './repositories/merges/sqlite-message-merges';
import { SqliteMessageRepository } from './repositories/sqlite-message-repository';
import { SqlitePendingWorkRepository } from './repositories/sqlite-pending-work-repository';
import { SqliteReminderRepository } from './repositories/sqlite-reminder-repository';
import { SqliteScheduledSendRepository } from './repositories/sqlite-scheduled-send-repository';
import { SqliteSettingsRepository } from './repositories/sqlite-settings-repository';
import { SqliteSplitRepository } from './repositories/sqlite-split-repository';
import { SqliteSyncStateRepository } from './repositories/sqlite-sync-state-repository';
import { SqliteTaskRepository } from './repositories/sqlite-task-repository';
import { SqliteTaskSystemConnectionRepository } from './repositories/sqlite-task-system-connection-repository';
import { SqliteThreadRepository } from './repositories/threads/sqlite-thread-repository';

export const createRepositoriesWith = (executor: SqliteExecutor): Repositories => ({
  accounts: new SqliteAccountRepository(executor),
  mailboxes: new SqliteMailboxRepository(executor),
  messages: new SqliteMessageRepository(executor),
  messageMerges: new SqliteMessageMerges(executor),
  emailIdResolutions: new SqliteEmailIdResolutions(executor),
  threads: new SqliteThreadRepository(executor),
  labels: new SqliteLabelRepository(executor),
  splits: new SqliteSplitRepository(executor),
  automations: new SqliteAutomationRepository(executor),
  automationRuns: new SqliteAutomationRunRepository(executor),
  automationActivity: new SqliteAutomationActivityRepository(executor),
  automationCandidates: new SqliteAutomationCandidateRepository(executor),
  tasks: new SqliteTaskRepository(executor),
  reminders: new SqliteReminderRepository(executor),
  drafts: new SqliteDraftRepository(executor),
  scheduledSends: new SqliteScheduledSendRepository(executor),
  settings: new SqliteSettingsRepository(executor),
  aiResults: new SqliteAiResultRepository(executor),
  aiJobs: new SqliteAiJobRepository(executor),
  syncStates: new SqliteSyncStateRepository(executor),
  pendingWork: new SqlitePendingWorkRepository(executor),
  calendarEvents: new SqliteCalendarEventRepository(executor),
  calendarSubscriptions: new SqliteCalendarSubscriptionRepository(executor),
  googleConnections: new SqliteGoogleConnectionRepository(executor),
  googleCalendars: new SqliteGoogleCalendarRepository(executor),
  googleEvents: new SqliteGoogleEventRepository(executor),
  inviteCandidates: new SqliteInviteCandidateRepository(executor),
  taskSystemConnections: new SqliteTaskSystemConnectionRepository(executor),
});

export const createSqliteRepositories = (database: SqliteDatabase): Repositories =>
  createRepositoriesWith(new QueuedExecutor(database));

export const createSqliteMessageAttachmentLookup = (
  database: SqliteDatabase,
): MessageAttachmentLookup => new SqliteMessageAttachmentLookup(new QueuedExecutor(database));

export const createSqliteMessageBodyRepairs = (
  database: SqliteDatabase,
): MessageBodyRepairRepository =>
  new SqliteMessageBodyRepairRepository(new QueuedExecutor(database));

export const createSqliteHistoryBackfills = (database: SqliteDatabase): HistoryBackfillRepository =>
  new SqliteHistoryBackfillRepository(new QueuedExecutor(database));

export const createSqliteMessageBodies = (database: SqliteDatabase): MessageBodyStore =>
  new SqliteMessageBodyStore(new QueuedExecutor(database));

export const createSqliteAttachmentReferences = (
  database: SqliteDatabase,
): AttachmentReferenceRepository =>
  new SqliteAttachmentReferenceRepository(new QueuedExecutor(database));

export const createSqliteMessageUids = (database: SqliteDatabase): MessageUidLookup =>
  new SqliteMessageUidLookup(new QueuedExecutor(database));
