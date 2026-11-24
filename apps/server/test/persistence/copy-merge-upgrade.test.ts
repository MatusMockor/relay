import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import {
  openPostgresConnection,
  type PostgresConnection,
} from '../../src/persistence/database/postgres-connection';
import {
  DEFAULT_MIGRATIONS_FOLDER,
  runMigrations,
} from '../../src/persistence/migrations/migration-runner';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const MIGRATION = '0038_copy_merge';
const INDEXES = [
  'automation_runs_message_idx',
  'drafts_reply_message_idx',
  'message_aliases_message_idx',
  'messages_account_email_bytes_idx',
];

interface WorkRow {
  readonly account_id: string;
  readonly kind: string;
  readonly ref: string;
  readonly payload: unknown;
  readonly revision: string;
}

const copyMergeRows = async (client: pg.Client): Promise<WorkRow[]> => {
  const { rows } = await client.query<WorkRow>(
    `SELECT account_id, kind, ref, payload, revision FROM pending_work
     WHERE kind = 'copy-merge' ORDER BY account_id`,
  );
  return rows;
};

describe('copy merge migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-copy-merge-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === MIGRATION);
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

  it('enqueues one fresh copy merge pass per account exactly once', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const gmail = await seedLegacyAccount(database.url, repositories);
    const generic = await seedLegacyAccount(database.url, repositories);
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    onTestFinished(() => client.end());
    await expect(copyMergeRows(client)).resolves.toEqual([]);

    await runMigrations({ databaseUrl: database.url });
    const enqueued = await copyMergeRows(client);
    const statements = readFileSync(join(DEFAULT_MIGRATIONS_FOLDER, `${MIGRATION}.sql`), 'utf8')
      .split('--> statement-breakpoint')
      .filter((statement) => statement.includes('INSERT INTO "pending_work"'));
    expect(statements).toHaveLength(1);
    await client.query(statements.join(''));
    await runMigrations({ databaseUrl: database.url });

    expect(enqueued).toEqual(
      [gmail.account.id, generic.account.id].sort().map((accountId) => ({
        account_id: accountId,
        kind: 'copy-merge',
        ref: 'account',
        payload: {},
        revision: expect.any(String) as unknown,
      })),
    );
    await expect(copyMergeRows(client)).resolves.toEqual(enqueued);
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1) ORDER BY indexname`,
      [INDEXES],
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([...INDEXES].sort());
  });
});
