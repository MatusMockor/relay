import { afterAll, beforeAll } from 'vitest';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';
import type { DbExecutor } from '../../../src/persistence/database/database';
import {
  openPostgresConnection,
  type PostgresConnection,
} from '../../../src/persistence/database/postgres-connection';
import { createPgRepositories } from '../../../src/persistence/repositories/create-pg-repositories';
import { createTestDatabase, type TestDatabase } from './test-database';

export interface PgTestContext {
  readonly url: string;
  readonly db: DbExecutor;
  readonly repositories: ServerRepositories;
}

export const usePgTestContext = (): PgTestContext => {
  let database: TestDatabase | undefined;
  let connection: PostgresConnection | undefined;
  let repositories: ServerRepositories | undefined;

  beforeAll(async () => {
    database = await createTestDatabase();
    connection = openPostgresConnection({ url: database.url, maxConnections: 4 });
    repositories = createPgRepositories(connection.db);
  });

  afterAll(async () => {
    await connection?.close();
    await database?.drop();
  });

  return {
    get url() {
      return database?.url ?? '';
    },
    get db() {
      return connection?.db as DbExecutor;
    },
    get repositories() {
      return repositories as ServerRepositories;
    },
  };
};
