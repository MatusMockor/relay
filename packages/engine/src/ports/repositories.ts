import type { AccountRepository } from './account-repository';
import type { AutomationActivityRepository } from './automation-activity-repository';
import type { AiJobRepository } from './ai-job-repository';
import type { AiResultRepository } from './ai-result-repository';
import type { AutomationCandidateRepository } from './automation-candidate-repository';
import type { AutomationRepository } from './automation-repository';
import type { AutomationRunRepository } from './automation-run-repository';
import type { CalendarEventRepository } from './calendar-event-repository';
import type { CalendarSubscriptionRepository } from './calendar-subscription-repository';
import type { DraftRepository } from './draft-repository';
import type {
  GoogleCalendarRepository,
  GoogleConnectionRepository,
  GoogleEventRepository,
} from './google-calendar-repositories';
import type { InviteCandidateRepository } from './invite-candidate-repository';
import type { LabelRepository } from './label-repository';
import type { MailboxRepository } from './mailbox-repository';
import type { MessageRepository } from './message-repository';
import type { PendingWorkRepository } from './pending-work-repository';
import type { ReminderRepository } from './reminder-repository';
import type { ScheduledSendRepository } from './scheduled-send-repository';
import type { SettingsRepository } from './settings-repository';
import type { SplitRepository } from './split-repository';
import type { SyncStateRepository } from './sync-state-repository';
import type { TaskRepository } from './task-repository';
import type { ThreadRepository } from './thread-repository';

export interface Repositories {
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly messages: MessageRepository;
  readonly threads: ThreadRepository;
  readonly labels: LabelRepository;
  readonly splits: SplitRepository;
  readonly automations: AutomationRepository;
  readonly automationRuns: AutomationRunRepository;
  readonly automationActivity: AutomationActivityRepository;
  readonly automationCandidates: AutomationCandidateRepository;
  readonly tasks: TaskRepository;
  readonly reminders: ReminderRepository;
  readonly drafts: DraftRepository;
  readonly scheduledSends: ScheduledSendRepository;
  readonly settings: SettingsRepository;
  readonly aiResults: AiResultRepository;
  readonly aiJobs: AiJobRepository;
  readonly syncStates: SyncStateRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly calendarEvents: CalendarEventRepository;
  readonly calendarSubscriptions: CalendarSubscriptionRepository;
  readonly googleConnections: GoogleConnectionRepository;
  readonly googleCalendars: GoogleCalendarRepository;
  readonly googleEvents: GoogleEventRepository;
  readonly inviteCandidates: InviteCandidateRepository;
}
