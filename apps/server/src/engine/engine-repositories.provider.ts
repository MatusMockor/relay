import type { FactoryProvider } from '@nestjs/common';
import { PORT_TOKENS, type Repositories } from '@relay/engine';

export const ENGINE_REPOSITORIES = Symbol.for('relay.server.EngineRepositories');

const REPOSITORY_TOKENS = {
  accounts: PORT_TOKENS.AccountRepository,
  mailboxes: PORT_TOKENS.MailboxRepository,
  messages: PORT_TOKENS.MessageRepository,
  threads: PORT_TOKENS.ThreadRepository,
  labels: PORT_TOKENS.LabelRepository,
  splits: PORT_TOKENS.SplitRepository,
  automations: PORT_TOKENS.AutomationRepository,
  automationRuns: PORT_TOKENS.AutomationRunRepository,
  automationActivity: PORT_TOKENS.AutomationActivityRepository,
  tasks: PORT_TOKENS.TaskRepository,
  reminders: PORT_TOKENS.ReminderRepository,
  drafts: PORT_TOKENS.DraftRepository,
  scheduledSends: PORT_TOKENS.ScheduledSendRepository,
  settings: PORT_TOKENS.SettingsRepository,
  aiResults: PORT_TOKENS.AiResultRepository,
  aiJobs: PORT_TOKENS.AiJobRepository,
  syncStates: PORT_TOKENS.SyncStateRepository,
  pendingWork: PORT_TOKENS.PendingWorkRepository,
  calendarEvents: PORT_TOKENS.CalendarEventRepository,
  calendarSubscriptions: PORT_TOKENS.CalendarSubscriptionRepository,
  googleConnections: PORT_TOKENS.GoogleConnectionRepository,
  googleCalendars: PORT_TOKENS.GoogleCalendarRepository,
  googleEvents: PORT_TOKENS.GoogleEventRepository,
  inviteCandidates: PORT_TOKENS.InviteCandidateRepository,
  automationCandidates: PORT_TOKENS.AutomationCandidateRepository,
  taskSystemConnections: PORT_TOKENS.TaskSystemConnectionRepository,
} as const satisfies Record<keyof Repositories, symbol>;

const KEYS = Object.keys(REPOSITORY_TOKENS) as (keyof Repositories)[];

export const engineRepositoriesProvider: FactoryProvider<Repositories> = {
  provide: ENGINE_REPOSITORIES,
  inject: KEYS.map((key) => REPOSITORY_TOKENS[key]),
  useFactory: (...repositories: unknown[]) =>
    Object.fromEntries(
      KEYS.map((key, index) => [key, repositories[index]]),
    ) as unknown as Repositories,
};
