import { randomBytes } from 'node:crypto';
import { testInfra } from '@relay/config/test-infra';
import pg from 'pg';
import { runMigrations } from '../../../src/persistence/migrations/migration-runner';

export interface TestDatabase {
  readonly url: string;
  drop(): Promise<void>;
}

export interface TestDatabaseOptions {
  readonly adminUrl?: string;
  readonly migrate?: boolean;
}

const withAdminClient = async <Result>(
  adminUrl: string,
  work: (client: pg.Client) => Promise<Result>,
): Promise<Result> => {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

const databaseUrlFor = (adminUrl: string, name: string): string => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

export const createTestDatabase = async (
  options: TestDatabaseOptions = {},
): Promise<TestDatabase> => {
  const adminUrl = options.adminUrl ?? testInfra.postgres.url;
  const name = `relay_test_${randomBytes(6).toString('hex')}`;
  await withAdminClient(adminUrl, (client) =>
    client.query(`CREATE DATABASE "${name}" TEMPLATE template0`),
  );
  const url = databaseUrlFor(adminUrl, name);
  if (options.migrate !== false) {
    await runMigrations({ databaseUrl: url });
  }
  return {
    url,
    drop: async () => {
      await withAdminClient(adminUrl, (client) =>
        client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
      );
    },
  };
};
