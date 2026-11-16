import { randomBytes } from 'node:crypto';
import { testInfra } from '@relay/config/test-infra';
import pg from 'pg';
import { withPostgresRetry } from './transient-postgres';

export interface ServerDatabase {
  readonly name: string;
  readonly url: string;
  drop(): Promise<void>;
}

const connectAdmin = async (): Promise<pg.Client> => {
  const client = new pg.Client({ connectionString: testInfra.postgres.url });
  await client.connect();
  return client;
};

const withAdmin = async (work: (client: pg.Client) => Promise<unknown>): Promise<void> => {
  const client = await withPostgresRetry(connectAdmin);
  try {
    await work(client);
  } finally {
    await client.end();
  }
};

const urlOf = (name: string): string => {
  const url = new URL(testInfra.postgres.url);
  url.pathname = `/${name}`;
  return url.toString();
};

export const createServerDatabase = async (): Promise<ServerDatabase> => {
  const name = `relay_test_desktop_${randomBytes(6).toString('hex')}`;
  await withAdmin((client) => client.query(`CREATE DATABASE "${name}" TEMPLATE template0`));
  return {
    name,
    url: urlOf(name),
    drop: () =>
      withAdmin((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)),
  };
};

export const databaseExists = async (name: string): Promise<boolean> => {
  let found = false;
  await withAdmin(async (client) => {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    found = result.rowCount === 1;
  });
  return found;
};
