import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { at, buildAccount, buildUser } from './support/fixtures';
import { insertLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

describe('account sort order migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-sort-order-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0039_account_sort_order');
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

  it('numbers the existing accounts of each user by creation time', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const user = await repositories.users.create(buildUser(), 'hash');
    const other = await repositories.users.create(buildUser(), 'hash');
    const late = buildAccount(user.id, { createdAt: at(30) });
    const early = buildAccount(user.id, { createdAt: at(10) });
    const middle = buildAccount(user.id, { createdAt: at(20) });
    const foreign = buildAccount(other.id, { createdAt: at(40) });
    for (const account of [late, early, middle, foreign]) {
      await insertLegacyAccount(database.url, account);
    }

    await runMigrations({ databaseUrl: database.url });

    const added = await repositories.accounts.create(buildAccount(user.id, { createdAt: at(0) }));
    const listed = await repositories.accounts.listByUser(user.id);
    expect(listed.map((account) => account.id)).toEqual([early.id, middle.id, late.id, added.id]);
    const positions = await connection.pool.query<{ id: string; sort_order: number }>(
      'select id, sort_order from mail_accounts order by sort_order, created_at',
    );
    expect(positions.rows).toEqual([
      { id: early.id, sort_order: 0 },
      { id: foreign.id, sort_order: 0 },
      { id: middle.id, sort_order: 1 },
      { id: late.id, sort_order: 2 },
      { id: added.id, sort_order: 3 },
    ]);
  });
});
