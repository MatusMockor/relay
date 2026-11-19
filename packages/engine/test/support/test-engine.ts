import type { AiRunnerLocation, UserId } from '@relay/shared/domain';
import {
  type ActionOptions,
  type AiOptions,
  type CalendarOptions,
  createEngineServices,
  type EngineServices,
  type MessageBodyRepairRepository,
  type Repositories,
  type SettingsOptions,
  type SplitMatcher,
  type SyncOptions,
} from '../../src';
import {
  ManualClock,
  MemoryAttachmentStore,
  MemoryCredentialVault,
  MemoryLogger,
  RecordingEventPublisher,
  SequentialIdGenerator,
} from './fakes/infrastructure';
import { ManualIntervalTimer } from './fakes/manual-interval-timer';
import {
  MemoryAttachmentBlobCatalog,
  MemoryAttachmentReferences,
} from './fakes/memory-attachment-blobs';
import { type CalendarFakes, createCalendarFakes } from './fakes/calendar-adapters';
import { createGoogleCalendarFakes, type GoogleCalendarFakes } from './fakes/fake-google-calendar';
import { MemoryAiRunnerRegistry, StubAiRunner } from './fakes/stub-ai-runner';
import { FakeMailProviderFactory } from './mail/fake-mail-provider-factory';
import { RecordingUnsubscribeSender } from './fakes/recording-unsubscribe-sender';
import { FakeMailSender } from './mail/fake-mail-sender';
import { HeaderThreadResolver } from './mail/header-thread-resolver';
import { RuleAutomationMatcher, RuleSplitMatcher } from './mail/rule-split-matcher';
import { SimpleMessageParser } from './mail/simple-message-parser';
import { SubjectJiraClassifier } from './mail/subject-jira-classifier';
import { MemoryDatabase } from './memory/memory-database';
import { MemoryMessageBodyRepairs } from './memory/memory-message-body-repairs';
import { createMemoryRepositories, MemoryUnitOfWork } from './memory/memory-repositories';

export const TEST_NOW = '2026-11-15T10:00:00.000Z';
export const USER_ID = 'user_alice' as UserId;
export const OTHER_USER_ID = 'user_bob' as UserId;

export interface TestEngineOptions {
  readonly aiRunnerLocation?: AiRunnerLocation;
  readonly sync?: Partial<SyncOptions>;
  readonly ai?: Partial<AiOptions>;
  readonly settings?: SettingsOptions;
  readonly calendar?: Partial<CalendarOptions>;
  readonly actions?: Partial<ActionOptions>;
  readonly splitMatcher?: SplitMatcher;
  readonly messageBodyRepairs?: (db: MemoryDatabase) => MessageBodyRepairRepository;
}

export interface TestEngine {
  readonly db: MemoryDatabase;
  readonly repositories: Repositories;
  readonly unitOfWork: MemoryUnitOfWork;
  readonly services: EngineServices;
  readonly clock: ManualClock;
  readonly timer: ManualIntervalTimer;
  readonly ids: SequentialIdGenerator;
  readonly events: RecordingEventPublisher;
  readonly logger: MemoryLogger;
  readonly vault: MemoryCredentialVault;
  readonly attachments: MemoryAttachmentStore;
  readonly attachmentBlobs: MemoryAttachmentBlobCatalog;
  readonly providers: FakeMailProviderFactory;
  readonly sender: FakeMailSender;
  readonly unsubscribes: RecordingUnsubscribeSender;
  readonly runners: MemoryAiRunnerRegistry;
  readonly claude: StubAiRunner;
  readonly calendar: CalendarFakes;
  readonly google: GoogleCalendarFakes;
}

export const createTestEngine = (options: TestEngineOptions = {}): TestEngine => {
  const db = new MemoryDatabase();
  const repositories = createMemoryRepositories(db);
  const unitOfWork = new MemoryUnitOfWork(db, repositories);
  const clock = new ManualClock(TEST_NOW);
  const timer = new ManualIntervalTimer();
  const ids = new SequentialIdGenerator();
  const events = new RecordingEventPublisher();
  const logger = new MemoryLogger();
  const vault = new MemoryCredentialVault();
  const attachments = new MemoryAttachmentStore(ids, clock);
  const attachmentBlobs = new MemoryAttachmentBlobCatalog(
    attachments,
    new MemoryAttachmentReferences(db),
  );
  const providers = new FakeMailProviderFactory();
  const sender = new FakeMailSender();
  const unsubscribes = new RecordingUnsubscribeSender();
  const runners = new MemoryAiRunnerRegistry();
  const claude = new StubAiRunner('claude', () => []);
  runners.register(claude);
  const calendar = createCalendarFakes();
  const google = createGoogleCalendarFakes();
  const services = createEngineServices({
    repositories,
    unitOfWork,
    mailProviderFactory: providers,
    mailSender: sender,
    unsubscribeSender: unsubscribes,
    credentialVault: vault,
    attachmentStore: attachments,
    attachmentBlobs,
    messageParser: new SimpleMessageParser(),
    messageBodyRepairs: options.messageBodyRepairs?.(db) ?? new MemoryMessageBodyRepairs(db),
    threadResolver: new HeaderThreadResolver(repositories.messages, ids),
    jiraClassifier: new SubjectJiraClassifier(),
    splitMatcher: options.splitMatcher ?? new RuleSplitMatcher(),
    automationMatcher: new RuleAutomationMatcher(),
    aiRunnerRegistry: runners,
    calendar,
    googleCalendar: google,
    eventPublisher: events,
    clock,
    idGenerator: ids,
    intervalTimer: timer,
    logger,
    options: {
      aiRunnerLocation: options.aiRunnerLocation ?? 'local',
      sync: options.sync,
      ai: options.ai,
      settings: options.settings,
      calendar: options.calendar,
      actions: options.actions,
    },
  });
  return {
    db,
    repositories,
    unitOfWork,
    services,
    clock,
    timer,
    ids,
    events,
    logger,
    vault,
    attachments,
    attachmentBlobs,
    providers,
    sender,
    unsubscribes,
    runners,
    claude,
    calendar,
    google,
  };
};
