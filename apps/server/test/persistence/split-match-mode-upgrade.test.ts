import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  openPostgresConnection,
  type PostgresConnection,
} from '../../src/persistence/database/postgres-connection';
import {
  DEFAULT_MIGRATIONS_FOLDER,
  runMigrations,
} from '../../src/persistence/migrations/migration-runner';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { buildUser } from './support/fixtures';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const RULES = [{ type: 'fromDomain', domain: 'klient.test' }];

const insertLegacySplit = async (databaseUrl: string, userId: string): Promise<void> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(
    'INSERT INTO splits (id, user_id, account_id, name, position, rules, exclusive) VALUES ($1, $2, null, $3, 0, $4, true)',
    ['split_klienti', userId, 'Klienti', JSON.stringify(RULES)],
  );
  await client.end();
};

describe('split match mode migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-splits-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0033_split_match_mode');
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, end) }),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await database.drop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('reads splits stored before the migration as any condition without exceptions', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const user = buildUser();
    await repositories.users.create(user, 'hash');
    await insertLegacySplit(database.url, user.id);

    await runMigrations({ databaseUrl: database.url });

    expect(await repositories.splits.listByUser(user.id)).toMatchObject([
      { id: 'split_klienti', name: 'Klienti', match: 'any', rules: RULES, exceptions: [] },
    ]);
  });
});
