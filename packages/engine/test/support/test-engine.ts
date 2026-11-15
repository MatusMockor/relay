import type { AiRunnerLocation, UserId } from '@relay/shared/domain';
import {
  type AiOptions,
  createEngineServices,
  type EngineServices,
  type Repositories,
  type SettingsOptions,
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
import { MemoryAiRunnerRegistry, StubAiRunner } from './fakes/stub-ai-runner';
import { FakeMailProviderFactory } from './mail/fake-mail-provider';
import { FakeMailSender } from './mail/fake-mail-sender';
import { HeaderThreadResolver } from './mail/header-thread-resolver';
import { RuleSplitMatcher } from './mail/rule-split-matcher';
import { SimpleMessageParser } from './mail/simple-message-parser';
import { SubjectJiraClassifier } from './mail/subject-jira-classifier';
import { MemoryDatabase } from './memory/memory-database';
import { createMemoryRepositories, MemoryUnitOfWork } from './memory/memory-repositories';

export const TEST_NOW = '2026-11-15T10:00:00.000Z';
export const USER_ID = 'user_alice' as UserId;
export const OTHER_USER_ID = 'user_bob' as UserId;

export interface TestEngineOptions {
  readonly aiRunnerLocation?: AiRunnerLocation;
  readonly sync?: Partial<SyncOptions>;
  readonly ai?: Partial<AiOptions>;
  readonly settings?: SettingsOptions;
}

export interface TestEngine {
  readonly db: MemoryDatabase;
  readonly repositories: Repositories;
  readonly unitOfWork: MemoryUnitOfWork;
  readonly services: EngineServices;
  readonly clock: ManualClock;
  readonly ids: SequentialIdGenerator;
  readonly events: RecordingEventPublisher;
  readonly logger: MemoryLogger;
  readonly vault: MemoryCredentialVault;
  readonly attachments: MemoryAttachmentStore;
  readonly providers: FakeMailProviderFactory;
  readonly sender: FakeMailSender;
  readonly runners: MemoryAiRunnerRegistry;
  readonly claude: StubAiRunner;
}

export const createTestEngine = (options: TestEngineOptions = {}): TestEngine => {
  const db = new MemoryDatabase();
  const repositories = createMemoryRepositories(db);
  const unitOfWork = new MemoryUnitOfWork(db, repositories);
  const clock = new ManualClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const events = new RecordingEventPublisher();
  const logger = new MemoryLogger();
  const vault = new MemoryCredentialVault();
  const attachments = new MemoryAttachmentStore(ids);
  const providers = new FakeMailProviderFactory();
  const sender = new FakeMailSender();
  const runners = new MemoryAiRunnerRegistry();
  const claude = new StubAiRunner('claude', () => []);
  runners.register(claude);
  const services = createEngineServices({
    repositories,
    unitOfWork,
    mailProviderFactory: providers,
    mailSender: sender,
    credentialVault: vault,
    attachmentStore: attachments,
    messageParser: new SimpleMessageParser(),
    threadResolver: new HeaderThreadResolver(repositories.messages, ids),
    jiraClassifier: new SubjectJiraClassifier(),
    splitMatcher: new RuleSplitMatcher(),
    aiRunnerRegistry: runners,
    eventPublisher: events,
    clock,
    idGenerator: ids,
    logger,
    options: {
      aiRunnerLocation: options.aiRunnerLocation ?? 'local',
      sync: options.sync,
      ai: options.ai,
      settings: options.settings,
    },
  });
  return {
    db,
    repositories,
    unitOfWork,
    services,
    clock,
    ids,
    events,
    logger,
    vault,
    attachments,
    providers,
    sender,
    runners,
    claude,
  };
};
