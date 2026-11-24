import {
  type AiMailToolsEndpoint,
  type AiRunnerRegistry,
  createEngineServices,
  DEFAULT_HISTORY_OPTIONS,
  type EngineServices,
  type GoogleCalendarAdapters,
  type HistoryOptions,
  type Repositories,
  type TaskSystemAdapterRegistry,
} from '@relay/engine';
import {
  createSqliteAttachmentReferences,
  createSqliteHistoryBackfills,
  createSqliteMessageAttachmentLookup,
  createSqliteMessageBodies,
  createSqliteMessageBodyRepairs,
  createSqliteMessageUids,
  createSqliteRepositories,
  migrate,
  openDatabase,
  type SqliteDatabase,
  SqliteUnitOfWork,
} from '@relay/store-sqlite';
import type { FeedFetchOptions } from '@relay/calendar';
import {
  buildSnippet,
  HttpsUnsubscribeSender,
  isUnsafeRegex,
  MailparserAttachmentExtractor,
} from '@relay/mail-core';
import type { GoogleClientConfigSource } from '../oauth/google-client-config-source';
import { DeviceOfflineWindow } from '../settings/device-offline-window';
import { FileAttachmentBlobCatalog } from '../storage/file-attachment-blob-catalog';
import { FileAttachmentStore } from '../storage/file-attachment-store';
import { createCalendarAdapters } from './calendar-adapters';
import { createMailAdapters, type MailAdapters } from './mail-adapters';
import type { MainInfrastructure } from './main-infrastructure';

export interface LocalEngineInput {
  readonly infrastructure: MainInfrastructure;
  readonly googleClient: GoogleClientConfigSource;
  readonly aiRunners: AiRunnerRegistry;
  readonly mailTools: AiMailToolsEndpoint | null;
  readonly allowPlaintextMail: boolean;
  readonly calendarFetch?: Partial<FeedFetchOptions>;
  readonly googleCalendar: GoogleCalendarAdapters;
  readonly taskSystems: TaskSystemAdapterRegistry;
  readonly googleSyncSeconds?: number;
  readonly historyOptions?: Partial<HistoryOptions>;
}

export interface LocalEngine {
  readonly services: EngineServices;
  readonly repositories: Repositories;
  readonly mail: MailAdapters;
  readonly database: SqliteDatabase;
  close(): void;
}

export const createLocalEngine = (input: LocalEngineInput): LocalEngine => {
  const { infrastructure } = input;
  const database = openDatabase(infrastructure.paths.database);
  migrate(database, {
    migrationsFolder: infrastructure.paths.migrations,
    snippetBuilder: buildSnippet,
  });
  const repositories = createSqliteRepositories(database);
  const mail = createMailAdapters({
    vault: infrastructure.vault,
    clock: infrastructure.clock,
    ids: infrastructure.ids,
    messages: repositories.messages,
    googleClient: input.googleClient,
    allowPlaintext: input.allowPlaintextMail,
  });
  const services = createEngineServices({
    repositories,
    unitOfWork: new SqliteUnitOfWork(database),
    ...mail,
    splitPatternPolicy: { isUnsafe: isUnsafeRegex },
    messageAttachmentLookup: createSqliteMessageAttachmentLookup(database),
    messageBodyRepairs: createSqliteMessageBodyRepairs(database),
    historyBackfills: createSqliteHistoryBackfills(database),
    messageUids: createSqliteMessageUids(database),
    messageBodies: createSqliteMessageBodies(database),
    offlineWindow: new DeviceOfflineWindow(infrastructure.deviceSettings, infrastructure.clock),
    attachmentExtractor: new MailparserAttachmentExtractor(),
    unsubscribeSender: new HttpsUnsubscribeSender(),
    credentialVault: infrastructure.vault,
    attachmentStore: new FileAttachmentStore(infrastructure.paths.attachments, infrastructure.ids),
    attachmentBlobs: new FileAttachmentBlobCatalog(
      infrastructure.paths.attachments,
      createSqliteAttachmentReferences(database),
    ),
    aiRunnerRegistry: input.aiRunners,
    calendar: createCalendarAdapters(infrastructure.calendarFeeds, input.calendarFetch),
    googleCalendar: input.googleCalendar,
    taskSystems: { registry: input.taskSystems, secrets: infrastructure.taskSystemSecrets },
    eventPublisher: infrastructure.publisher,
    clock: infrastructure.clock,
    idGenerator: infrastructure.ids,
    logger: infrastructure.logger.child({ component: 'engine' }),
    options: {
      aiRunnerLocation: 'local',
      settings: { pinnedAiLocation: 'local' },
      ai: { mailTools: input.mailTools },
      ...(input.historyOptions === undefined
        ? {}
        : { sync: { history: { ...DEFAULT_HISTORY_OPTIONS, ...input.historyOptions } } }),
      ...(input.googleSyncSeconds === undefined
        ? {}
        : { calendar: { googleSyncSeconds: input.googleSyncSeconds } }),
    },
  });
  return {
    services,
    repositories,
    mail,
    database,
    close: () => {
      database.close();
    },
  };
};
