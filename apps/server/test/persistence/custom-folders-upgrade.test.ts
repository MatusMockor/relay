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
import { newId } from './support/fixtures';
import { seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

describe('custom folders migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-folders-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0025_custom_folders');
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

  it('backfills label remote names and defaults mailboxes to subscribed', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const { user, account, mailboxes } = await seedLegacyAccount(database.url, repositories);
    const labelId = newId('label');
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    await client.query(
      'INSERT INTO labels (id, user_id, account_id, name, color) VALUES ($1, $2, $3, $4, $5)',
      [labelId, user.id, account.id, 'Faktúry', null],
    );
    await client.end();

    await runMigrations({ databaseUrl: database.url });

    await expect(repositories.mailboxes.findById(mailboxes.inbox.id)).resolves.toMatchObject({
      path: 'INBOX',
      subscribed: true,
      uidValidity: null,
    });
    await expect(repositories.labels.findById(user.id, labelId)).resolves.toEqual({
      id: labelId,
      accountId: account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktúry',
    });
  });
});
