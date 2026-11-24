import type { ServerRepositories } from '../../core/ports/server-unit-of-work';
import type { DbExecutor } from '../database/database';
import { PgAccountRepository } from './accounts/pg-account-repository';
import { PgAiJobRepository } from './ai-jobs/pg-ai-job-repository';
import { PgAiResultRepository } from './ai-results/pg-ai-result-repository';
import { PgAutomationRepository } from './automations/pg-automation-repository';
import { PgAutomationRunRepository } from './automations/pg-automation-run-repository';
import { PgAutomationActivityRepository } from './automations/pg-automation-activity-repository';
import { PgCalendarEventRepository } from './calendar/pg-calendar-event-repository';
import { PgCalendarSubscriptionRepository } from './calendar/pg-calendar-subscription-repository';
import { PgDeviceRepository } from './devices/pg-device-repository';
import { PgDraftRepository } from './drafts/pg-draft-repository';
import { PgGoogleCalendarRepository } from './google-calendar/pg-google-calendar-repository';
import { PgGoogleConnectionRepository } from './google-calendar/pg-google-connection-repository';
import { PgGoogleEventRepository } from './google-calendar/pg-google-event-repository';
import { PgLabelRepository } from './labels/pg-label-repository';
import { PgMailboxRepository } from './mailboxes/pg-mailbox-repository';
import { PgAutomationCandidateRepository } from './automations/pg-automation-candidate-repository';
import { PgInviteCandidateRepository } from './messages/pg-invite-candidate-repository';
import { PgEmailIdResolutions } from './messages/merges/pg-email-id-resolutions';
import { PgMessageMerges } from './messages/merges/pg-message-merges';
import { PgMessageRepository } from './messages/pg-message-repository';
import { PgPendingWorkRepository } from './pending-work/pg-pending-work-repository';
import { PgRefreshTokenRepository } from './refresh-tokens/pg-refresh-token-repository';
import { PgReminderRepository } from './reminders/pg-reminder-repository';
import { PgScheduledSendRepository } from './scheduled-sends/pg-scheduled-send-repository';
import { PgSettingsRepository } from './settings/pg-settings-repository';
import { PgSplitRepository } from './splits/pg-split-repository';
import { PgSyncStateRepository } from './sync-states/pg-sync-state-repository';
import { PgTaskRepository } from './tasks/pg-task-repository';
import { PgTaskSystemConnectionRepository } from './task-systems/pg-task-system-connection-repository';
import { PgThreadRepository } from './threads/pg-thread-repository';
import { PgUserRepository } from './users/pg-user-repository';

export const createPgRepositories = (db: DbExecutor): ServerRepositories => ({
  accounts: new PgAccountRepository(db),
  mailboxes: new PgMailboxRepository(db),
  messages: new PgMessageRepository(db),
  messageMerges: new PgMessageMerges(db),
  emailIdResolutions: new PgEmailIdResolutions(db),
  threads: new PgThreadRepository(db),
  labels: new PgLabelRepository(db),
  splits: new PgSplitRepository(db),
  automations: new PgAutomationRepository(db),
  automationRuns: new PgAutomationRunRepository(db),
  automationActivity: new PgAutomationActivityRepository(db),
  automationCandidates: new PgAutomationCandidateRepository(db),
  tasks: new PgTaskRepository(db),
  reminders: new PgReminderRepository(db),
  drafts: new PgDraftRepository(db),
  scheduledSends: new PgScheduledSendRepository(db),
  settings: new PgSettingsRepository(db),
  aiResults: new PgAiResultRepository(db),
  aiJobs: new PgAiJobRepository(db),
  syncStates: new PgSyncStateRepository(db),
  pendingWork: new PgPendingWorkRepository(db),
  calendarEvents: new PgCalendarEventRepository(db),
  calendarSubscriptions: new PgCalendarSubscriptionRepository(db),
  googleConnections: new PgGoogleConnectionRepository(db),
  googleCalendars: new PgGoogleCalendarRepository(db),
  googleEvents: new PgGoogleEventRepository(db),
  inviteCandidates: new PgInviteCandidateRepository(db),
  taskSystemConnections: new PgTaskSystemConnectionRepository(db),
  users: new PgUserRepository(db),
  devices: new PgDeviceRepository(db),
  refreshTokens: new PgRefreshTokenRepository(db),
});
