import type { ServerConfig } from './config/server-config';
import type { PersistenceConfig } from './persistence';

export const toPersistenceConfig = (config: ServerConfig): PersistenceConfig => ({
  databaseUrl: config.database.url,
  credentialsKey: config.credentialsEncryptionKey,
  migrateOnStart: config.database.migrateOnStart,
  maxConnections: config.database.poolMax,
});
