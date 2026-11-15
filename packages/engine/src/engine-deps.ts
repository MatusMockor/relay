import type { AiJob, AiRunnerLocation, UserSettings } from '@relay/shared/domain';
import type { AiMailToolsEndpoint } from './model/ai';
import type { AiRunnerRegistry } from './ports/ai-runner-registry';
import type { AttachmentExtractor } from './ports/attachment-extractor';
import type { AttachmentStore } from './ports/attachment-store';
import type { Clock } from './ports/clock';
import type { ConditionalCredentialVault } from './ports/credential-vault';
import type { EventPublisher } from './ports/event-publisher';
import type { IdGenerator } from './ports/id-generator';
import type { JiraClassifier } from './ports/jira-classifier';
import type { Logger } from './ports/logger';
import type { MailProviderFactory } from './ports/mail-provider-factory';
import type { MailSender } from './ports/mail-sender';
import type { MessageAttachmentLookup } from './ports/message-attachment-lookup';
import type { MessageParser } from './ports/message-parser';
import type { Repositories } from './ports/repositories';
import type { SplitMatcher } from './ports/split-matcher';
import type { SplitPatternPolicy } from './ports/split-pattern-policy';
import type { ThreadResolver } from './ports/thread-resolver';
import type { UnitOfWork } from './ports/unit-of-work';
import type { SyncOptions } from './services/sync/sync-options';

export type AiMailToolsResolver = (job: AiJob) => Promise<AiMailToolsEndpoint | null>;

export interface AiOptions {
  readonly timeoutMs: number;
  readonly mailTools: AiMailToolsEndpoint | AiMailToolsResolver | null;
  readonly oneLinersPerSync: number;
  readonly workerId: string | null;
}

export interface SettingsOptions {
  readonly defaults?: UserSettings;
  readonly pinnedAiLocation?: AiRunnerLocation;
}

export interface EngineOptions {
  readonly aiRunnerLocation: AiRunnerLocation;
  readonly settings?: SettingsOptions;
  readonly sync?: Partial<SyncOptions>;
  readonly ai?: Partial<AiOptions>;
}

export interface EngineDeps {
  readonly repositories: Repositories;
  readonly unitOfWork: UnitOfWork;
  readonly mailProviderFactory: MailProviderFactory;
  readonly mailSender: MailSender;
  readonly credentialVault: ConditionalCredentialVault;
  readonly attachmentStore: AttachmentStore;
  readonly messageAttachmentLookup?: MessageAttachmentLookup;
  readonly attachmentExtractor?: AttachmentExtractor;
  readonly messageParser: MessageParser;
  readonly threadResolver: ThreadResolver;
  readonly jiraClassifier: JiraClassifier;
  readonly splitMatcher: SplitMatcher;
  readonly splitPatternPolicy?: SplitPatternPolicy;
  readonly aiRunnerRegistry: AiRunnerRegistry;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
  readonly options: EngineOptions;
}
