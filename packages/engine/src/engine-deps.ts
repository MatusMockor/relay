import type { AiJob, AiRunnerLocation, UserSettings } from '@relay/shared/domain';
import type { AiMailToolsEndpoint } from './model/ai';
import type { AiRunnerRegistry } from './ports/ai-runner-registry';
import type { AttachmentBlobCatalog } from './ports/attachment-blob-catalog';
import type { AttachmentExtractor } from './ports/attachment-extractor';
import type { AttachmentStore } from './ports/attachment-store';
import type { AutomationMatcher } from './ports/automation-matcher';
import type { CalendarAdapters } from './ports/calendar-adapters';
import type { Clock } from './ports/clock';
import type { ConditionalCredentialVault } from './ports/credential-vault';
import type { EventPublisher } from './ports/event-publisher';
import type { GoogleCalendarAdapters } from './ports/google-calendar-adapters';
import type { HistoryBackfillRepository } from './ports/history-backfill-repository';
import type { IdGenerator } from './ports/id-generator';
import type { IntervalTimer } from './ports/interval-timer';
import type { JiraClassifier } from './ports/jira-classifier';
import type { Logger } from './ports/logger';
import type { MailProviderFactory } from './ports/mail-provider-factory';
import type { MailSender } from './ports/mail-sender';
import type { MessageAttachmentLookup } from './ports/message-attachment-lookup';
import type { MessageBodyRepairRepository } from './ports/message-body-repair-repository';
import type { MessageParser } from './ports/message-parser';
import type { Repositories } from './ports/repositories';
import type { SplitMatcher } from './ports/split-matcher';
import type { SplitPatternPolicy } from './ports/split-pattern-policy';
import type { ThreadResolver } from './ports/thread-resolver';
import type { UnitOfWork } from './ports/unit-of-work';
import type { UnsubscribeSender } from './ports/unsubscribe-sender';
import type { AttachmentSweepOptions } from './services/attachments/attachment-sweep-options';
import type { SyncOptions } from './services/sync/sync-options';

export type AiMailToolsResolver = (
  job: AiJob,
  owner: string,
) => Promise<AiMailToolsEndpoint | null>;

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

export interface CalendarOptions {
  readonly feedRefreshSeconds: number;
  readonly inviteBackfillBatch: number;
  readonly googleSyncSeconds: number;
}

export interface ActionOptions {
  readonly folderReadPageSize: number;
}

export interface EngineOptions {
  readonly aiRunnerLocation: AiRunnerLocation;
  readonly settings?: SettingsOptions;
  readonly sync?: Partial<SyncOptions>;
  readonly ai?: Partial<AiOptions>;
  readonly calendar?: Partial<CalendarOptions>;
  readonly attachments?: Partial<AttachmentSweepOptions>;
  readonly actions?: Partial<ActionOptions>;
}

export interface EngineDeps {
  readonly repositories: Repositories;
  readonly unitOfWork: UnitOfWork;
  readonly mailProviderFactory: MailProviderFactory;
  readonly mailSender: MailSender;
  readonly credentialVault: ConditionalCredentialVault;
  readonly attachmentStore: AttachmentStore;
  readonly attachmentBlobs: AttachmentBlobCatalog;
  readonly messageAttachmentLookup?: MessageAttachmentLookup;
  readonly messageBodyRepairs?: MessageBodyRepairRepository;
  readonly historyBackfills?: HistoryBackfillRepository;
  readonly attachmentExtractor?: AttachmentExtractor;
  readonly unsubscribeSender?: UnsubscribeSender;
  readonly messageParser: MessageParser;
  readonly threadResolver: ThreadResolver;
  readonly jiraClassifier: JiraClassifier;
  readonly splitMatcher: SplitMatcher;
  readonly automationMatcher: AutomationMatcher;
  readonly splitPatternPolicy?: SplitPatternPolicy;
  readonly aiRunnerRegistry: AiRunnerRegistry;
  readonly calendar: CalendarAdapters;
  readonly googleCalendar?: GoogleCalendarAdapters;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly intervalTimer?: IntervalTimer;
  readonly logger: Logger;
  readonly options: EngineOptions;
}
