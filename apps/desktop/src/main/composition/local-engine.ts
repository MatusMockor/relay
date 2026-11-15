import {
  type AiMailToolsEndpoint,
  type AiRunnerRegistry,
  createEngineServices,
  type EngineServices,
  type Repositories,
} from '@relay/engine';
import {
  createSqliteMessageAttachmentLookup,
  createSqliteRepositories,
  migrate,
  openDatabase,
  type SqliteDatabase,
  SqliteUnitOfWork,
} from '@relay/store-sqlite';
import { isUnsafeRegex, MailparserAttachmentExtractor } from '@relay/mail-core';
import type { GoogleClientConfigSource } from '../oauth/google-client-config-source';
import { FileAttachmentStore } from '../storage/file-attachment-store';
import { createMailAdapters, type MailAdapters } from './mail-adapters';
import type { MainInfrastructure } from './main-infrastructure';

export interface LocalEngineInput {
  readonly infrastructure: MainInfrastructure;
  readonly googleClient: GoogleClientConfigSource;
  readonly aiRunners: AiRunnerRegistry;
  readonly mailTools: AiMailToolsEndpoint | null;
  readonly allowPlaintextMail: boolean;
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
  migrate(database, { migrationsFolder: infrastructure.paths.migrations });
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
    attachmentExtractor: new MailparserAttachmentExtractor(),
    credentialVault: infrastructure.vault,
    attachmentStore: new FileAttachmentStore(infrastructure.paths.attachments, infrastructure.ids),
    aiRunnerRegistry: input.aiRunners,
    eventPublisher: infrastructure.publisher,
    clock: infrastructure.clock,
    idGenerator: infrastructure.ids,
    logger: infrastructure.logger.child({ component: 'engine' }),
    options: {
      aiRunnerLocation: 'local',
      settings: { pinnedAiLocation: 'local' },
      ai: { mailTools: input.mailTools },
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
