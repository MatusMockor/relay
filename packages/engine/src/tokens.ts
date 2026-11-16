import type { AccountRepository } from './ports/account-repository';
import type { AiJobRepository } from './ports/ai-job-repository';
import type { AiResultRepository } from './ports/ai-result-repository';
import type { AiRunnerRegistry } from './ports/ai-runner-registry';
import type { AttachmentBlobCatalog } from './ports/attachment-blob-catalog';
import type { AttachmentExtractor } from './ports/attachment-extractor';
import type { AttachmentStore } from './ports/attachment-store';
import type { CalendarAdapters } from './ports/calendar-adapters';
import type { CalendarEventRepository } from './ports/calendar-event-repository';
import type { CalendarSubscriptionRepository } from './ports/calendar-subscription-repository';
import type { Clock } from './ports/clock';
import type { CredentialVault } from './ports/credential-vault';
import type { DraftRepository } from './ports/draft-repository';
import type { EventPublisher } from './ports/event-publisher';
import type { GoogleCalendarAdapters } from './ports/google-calendar-adapters';
import type {
  GoogleCalendarRepository,
  GoogleConnectionRepository,
  GoogleEventRepository,
} from './ports/google-calendar-repositories';
import type { IdGenerator } from './ports/id-generator';
import type { InviteCandidateRepository } from './ports/invite-candidate-repository';
import type { JiraClassifier } from './ports/jira-classifier';
import type { LabelRepository } from './ports/label-repository';
import type { Logger } from './ports/logger';
import type { MailProviderFactory } from './ports/mail-provider-factory';
import type { MailSender } from './ports/mail-sender';
import type { MailboxRepository } from './ports/mailbox-repository';
import type { MessageAttachmentLookup } from './ports/message-attachment-lookup';
import type { MessageParser } from './ports/message-parser';
import type { MessageRepository } from './ports/message-repository';
import type { PendingWorkRepository } from './ports/pending-work-repository';
import type { ReminderRepository } from './ports/reminder-repository';
import type { ScheduledSendRepository } from './ports/scheduled-send-repository';
import type { SettingsRepository } from './ports/settings-repository';
import type { SplitMatcher } from './ports/split-matcher';
import type { SplitPatternPolicy } from './ports/split-pattern-policy';
import type { SplitRepository } from './ports/split-repository';
import type { SyncStateRepository } from './ports/sync-state-repository';
import type { TaskRepository } from './ports/task-repository';
import type { ThreadRepository } from './ports/thread-repository';
import type { ThreadResolver } from './ports/thread-resolver';
import type { UnitOfWork } from './ports/unit-of-work';

export const PORT_TOKENS = {
  AccountRepository: Symbol.for('relay.engine.AccountRepository'),
  MailboxRepository: Symbol.for('relay.engine.MailboxRepository'),
  MessageRepository: Symbol.for('relay.engine.MessageRepository'),
  ThreadRepository: Symbol.for('relay.engine.ThreadRepository'),
  LabelRepository: Symbol.for('relay.engine.LabelRepository'),
  SplitRepository: Symbol.for('relay.engine.SplitRepository'),
  TaskRepository: Symbol.for('relay.engine.TaskRepository'),
  ReminderRepository: Symbol.for('relay.engine.ReminderRepository'),
  DraftRepository: Symbol.for('relay.engine.DraftRepository'),
  ScheduledSendRepository: Symbol.for('relay.engine.ScheduledSendRepository'),
  SettingsRepository: Symbol.for('relay.engine.SettingsRepository'),
  AiResultRepository: Symbol.for('relay.engine.AiResultRepository'),
  AiJobRepository: Symbol.for('relay.engine.AiJobRepository'),
  SyncStateRepository: Symbol.for('relay.engine.SyncStateRepository'),
  PendingWorkRepository: Symbol.for('relay.engine.PendingWorkRepository'),
  CalendarEventRepository: Symbol.for('relay.engine.CalendarEventRepository'),
  CalendarSubscriptionRepository: Symbol.for('relay.engine.CalendarSubscriptionRepository'),
  CalendarAdapters: Symbol.for('relay.engine.CalendarAdapters'),
  InviteCandidateRepository: Symbol.for('relay.engine.InviteCandidateRepository'),
  GoogleConnectionRepository: Symbol.for('relay.engine.GoogleConnectionRepository'),
  GoogleCalendarRepository: Symbol.for('relay.engine.GoogleCalendarRepository'),
  GoogleEventRepository: Symbol.for('relay.engine.GoogleEventRepository'),
  GoogleCalendarAdapters: Symbol.for('relay.engine.GoogleCalendarAdapters'),
  MessageAttachmentLookup: Symbol.for('relay.engine.MessageAttachmentLookup'),
  UnitOfWork: Symbol.for('relay.engine.UnitOfWork'),
  MailProviderFactory: Symbol.for('relay.engine.MailProviderFactory'),
  MailSender: Symbol.for('relay.engine.MailSender'),
  CredentialVault: Symbol.for('relay.engine.CredentialVault'),
  AttachmentStore: Symbol.for('relay.engine.AttachmentStore'),
  AttachmentExtractor: Symbol.for('relay.engine.AttachmentExtractor'),
  AttachmentBlobCatalog: Symbol.for('relay.engine.AttachmentBlobCatalog'),
  MessageParser: Symbol.for('relay.engine.MessageParser'),
  ThreadResolver: Symbol.for('relay.engine.ThreadResolver'),
  JiraClassifier: Symbol.for('relay.engine.JiraClassifier'),
  SplitMatcher: Symbol.for('relay.engine.SplitMatcher'),
  SplitPatternPolicy: Symbol.for('relay.engine.SplitPatternPolicy'),
  AiRunnerRegistry: Symbol.for('relay.engine.AiRunnerRegistry'),
  EventPublisher: Symbol.for('relay.engine.EventPublisher'),
  Clock: Symbol.for('relay.engine.Clock'),
  IdGenerator: Symbol.for('relay.engine.IdGenerator'),
  Logger: Symbol.for('relay.engine.Logger'),
} as const;

export interface PortRegistry {
  AccountRepository: AccountRepository;
  MailboxRepository: MailboxRepository;
  MessageRepository: MessageRepository;
  ThreadRepository: ThreadRepository;
  LabelRepository: LabelRepository;
  SplitRepository: SplitRepository;
  TaskRepository: TaskRepository;
  ReminderRepository: ReminderRepository;
  DraftRepository: DraftRepository;
  ScheduledSendRepository: ScheduledSendRepository;
  SettingsRepository: SettingsRepository;
  AiResultRepository: AiResultRepository;
  AiJobRepository: AiJobRepository;
  SyncStateRepository: SyncStateRepository;
  PendingWorkRepository: PendingWorkRepository;
  CalendarEventRepository: CalendarEventRepository;
  CalendarSubscriptionRepository: CalendarSubscriptionRepository;
  CalendarAdapters: CalendarAdapters;
  InviteCandidateRepository: InviteCandidateRepository;
  GoogleConnectionRepository: GoogleConnectionRepository;
  GoogleCalendarRepository: GoogleCalendarRepository;
  GoogleEventRepository: GoogleEventRepository;
  GoogleCalendarAdapters: GoogleCalendarAdapters;
  MessageAttachmentLookup: MessageAttachmentLookup;
  UnitOfWork: UnitOfWork;
  MailProviderFactory: MailProviderFactory;
  MailSender: MailSender;
  CredentialVault: CredentialVault;
  AttachmentStore: AttachmentStore;
  AttachmentExtractor: AttachmentExtractor;
  AttachmentBlobCatalog: AttachmentBlobCatalog;
  MessageParser: MessageParser;
  ThreadResolver: ThreadResolver;
  JiraClassifier: JiraClassifier;
  SplitMatcher: SplitMatcher;
  SplitPatternPolicy: SplitPatternPolicy;
  AiRunnerRegistry: AiRunnerRegistry;
  EventPublisher: EventPublisher;
  Clock: Clock;
  IdGenerator: IdGenerator;
  Logger: Logger;
}

export type PortName = keyof PortRegistry;
export type PortToken<Name extends PortName> = (typeof PORT_TOKENS)[Name];
