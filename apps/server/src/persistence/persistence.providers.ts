import { type FactoryProvider, Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PORT_TOKENS } from '@relay/engine';
import { SERVER_PORT_TOKENS } from '../core/tokens';
import {
  type PersistenceConfig,
  PERSISTENCE_ENV_KEYS,
  parsePersistenceConfig,
} from './config/persistence-config';
import { AesGcmCipher } from './credentials/aes-gcm-cipher';
import { AesGcmCredentialVault } from './credentials/aes-gcm-credential-vault';
import { PgAccountCredentialStore } from './credentials/pg-account-credential-store';
import type { DbExecutor } from './database/database';
import { openPostgresConnection, type PostgresConnection } from './database/postgres-connection';
import { runMigrations } from './migrations/migration-runner';
import { DRIZZLE_DB, PERSISTENCE_CONFIG, PG_POOL, POSTGRES_CONNECTION } from './persistence.tokens';
import { PgAttachmentStore } from './repositories/attachments/pg-attachment-store';
import { createPgRepositories } from './repositories/create-pg-repositories';
import { PgMessageAttachmentLookup } from './repositories/messages/pg-message-attachment-lookup';
import type { ServerRepositories } from '../core/ports/server-unit-of-work';
import { PgUnitOfWork } from './unit-of-work/pg-unit-of-work';

const idleClientLogger = new Logger('Postgres');

export const configProviderFrom = (config: PersistenceConfig | undefined): Provider => {
  if (config !== undefined) {
    return { provide: PERSISTENCE_CONFIG, useValue: config };
  }
  return {
    provide: PERSISTENCE_CONFIG,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      parsePersistenceConfig(
        Object.fromEntries(
          PERSISTENCE_ENV_KEYS.map((key) => [key, configService.get<unknown>(key)]),
        ),
      ),
  };
};

const connectionProvider: FactoryProvider<PostgresConnection> = {
  provide: POSTGRES_CONNECTION,
  inject: [PERSISTENCE_CONFIG],
  useFactory: async (config: PersistenceConfig) => {
    if (config.migrateOnStart) {
      await runMigrations({
        databaseUrl: config.databaseUrl,
        ...(config.migrationsFolder === undefined
          ? {}
          : { migrationsFolder: config.migrationsFolder }),
      });
    }
    return openPostgresConnection({
      url: config.databaseUrl,
      maxConnections: config.maxConnections,
      onIdleClientError: (error) => {
        idleClientLogger.warn(`Idle Postgres client failed: ${error.message}`);
      },
    });
  },
};

const REPOSITORY_TOKENS: Readonly<Record<keyof ServerRepositories, symbol>> = {
  accounts: PORT_TOKENS.AccountRepository,
  mailboxes: PORT_TOKENS.MailboxRepository,
  messages: PORT_TOKENS.MessageRepository,
  threads: PORT_TOKENS.ThreadRepository,
  labels: PORT_TOKENS.LabelRepository,
  splits: PORT_TOKENS.SplitRepository,
  tasks: PORT_TOKENS.TaskRepository,
  reminders: PORT_TOKENS.ReminderRepository,
  drafts: PORT_TOKENS.DraftRepository,
  scheduledSends: PORT_TOKENS.ScheduledSendRepository,
  settings: PORT_TOKENS.SettingsRepository,
  aiResults: PORT_TOKENS.AiResultRepository,
  aiJobs: PORT_TOKENS.AiJobRepository,
  syncStates: PORT_TOKENS.SyncStateRepository,
  pendingWork: PORT_TOKENS.PendingWorkRepository,
  users: SERVER_PORT_TOKENS.UserRepository,
  devices: SERVER_PORT_TOKENS.DeviceRepository,
  refreshTokens: SERVER_PORT_TOKENS.RefreshTokenRepository,
};

const ROOT_REPOSITORIES = Symbol.for('relay.server.RootRepositories');

const repositoryProviders: Provider[] = [
  { provide: ROOT_REPOSITORIES, inject: [DRIZZLE_DB], useFactory: createPgRepositories },
  ...Object.entries(REPOSITORY_TOKENS).map(
    ([name, token]): Provider => ({
      provide: token,
      inject: [ROOT_REPOSITORIES],
      useFactory: (repositories: ServerRepositories) =>
        repositories[name as keyof ServerRepositories],
    }),
  ),
];

export const persistenceProviders: Provider[] = [
  connectionProvider,
  {
    provide: PG_POOL,
    inject: [POSTGRES_CONNECTION],
    useFactory: (connection: PostgresConnection) => connection.pool,
  },
  {
    provide: DRIZZLE_DB,
    inject: [POSTGRES_CONNECTION],
    useFactory: (connection: PostgresConnection) => connection.db,
  },
  ...repositoryProviders,
  {
    provide: PgUnitOfWork,
    inject: [DRIZZLE_DB],
    useFactory: (db: DbExecutor) => new PgUnitOfWork(db),
  },
  { provide: PORT_TOKENS.UnitOfWork, useExisting: PgUnitOfWork },
  { provide: SERVER_PORT_TOKENS.ServerUnitOfWork, useExisting: PgUnitOfWork },
  {
    provide: PORT_TOKENS.CredentialVault,
    inject: [DRIZZLE_DB, PERSISTENCE_CONFIG],
    useFactory: (db: DbExecutor, config: PersistenceConfig) =>
      new AesGcmCredentialVault(
        new PgAccountCredentialStore(db),
        new AesGcmCipher(config.credentialsKey),
      ),
  },
  {
    provide: PORT_TOKENS.AttachmentStore,
    inject: [DRIZZLE_DB],
    useFactory: (db: DbExecutor) => new PgAttachmentStore(db),
  },
  {
    provide: PORT_TOKENS.MessageAttachmentLookup,
    inject: [DRIZZLE_DB],
    useFactory: (db: DbExecutor) => new PgMessageAttachmentLookup(db),
  },
];

export const PERSISTENCE_EXPORTS = [
  PERSISTENCE_CONFIG,
  PG_POOL,
  DRIZZLE_DB,
  ...Object.values(REPOSITORY_TOKENS),
  PORT_TOKENS.UnitOfWork,
  SERVER_PORT_TOKENS.ServerUnitOfWork,
  PORT_TOKENS.CredentialVault,
  PORT_TOKENS.AttachmentStore,
  PORT_TOKENS.MessageAttachmentLookup,
];
