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
import { PgAttachmentStore } from '../../src/persistence/repositories/attachments/pg-attachment-store';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { at } from './support/fixtures';
import { seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const MIGRATIONS_BEFORE_UNIQUE_REFERENCES = 7;

describe('unique draft references migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-old-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
    writeFileSync(
      journalPath,
      JSON.stringify({
        ...journal,
        entries: journal.entries.slice(0, MIGRATIONS_BEFORE_UNIQUE_REFERENCES),
      }),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await database.drop();
    rmSync(folder, { recursive: true, force: true });
  });

  it('keeps one draft per attachment and one active send per draft', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const seeded = await seedLegacyAccount(database.url, repositories);
    const attachment = await new PgAttachmentStore(connection.db).put(seeded.user.id, {
      filename: 'a.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('a'),
    });
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    await client.query(
      `INSERT INTO drafts (id, user_id, account_id, to_addresses, cc_addresses, bcc_addresses, subject, body, created_at, updated_at)
       VALUES ('drf_a', $1, $2, '[]', '[]', '[]', 'A', '', $3, $3),
              ('drf_b', $1, $2, '[]', '[]', '[]', 'B', '', $3, $3)`,
      [seeded.user.id, seeded.account.id, at(0)],
    );
    await client.query(
      `INSERT INTO draft_attachments (draft_id, attachment_id, user_id, position)
       VALUES ('drf_a', $1, $2, 0), ('drf_b', $1, $2, 0)`,
      [attachment.id, seeded.user.id],
    );
    await client.query(
      `INSERT INTO scheduled_sends (id, user_id, account_id, draft_id, scheduled_at, status, created_at)
       VALUES ('sch_old', $1, $2, 'drf_a', $3, 'sending', $3),
              ('sch_new', $1, $2, 'drf_a', $3, 'pending', $4),
              ('sch_done', $1, $2, 'drf_a', $3, 'sent', $3)`,
      [seeded.user.id, seeded.account.id, at(0), at(1)],
    );

    await runMigrations({ databaseUrl: database.url });

    const links = await client.query<{ draft_id: string }>(
      'SELECT draft_id FROM draft_attachments ORDER BY draft_id',
    );
    const sends = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM scheduled_sends ORDER BY id',
    );
    await client.end();
    expect(links.rows.map((row) => row.draft_id)).toEqual(['drf_a']);
    expect(sends.rows).toEqual([
      { id: 'sch_done', status: 'sent' },
      { id: 'sch_new', status: 'cancelled' },
      { id: 'sch_old', status: 'sending' },
    ]);
  });
});
