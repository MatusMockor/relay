import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type MailboxRole, MessageIdSchema } from '@relay/shared/domain';
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
import { buildMailbox, newId } from './support/fixtures';
import { insertLegacyMailboxes, seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const ROLES: readonly MailboxRole[] = ['inbox', 'archive', 'sent', 'drafts', 'spam', 'custom'];

const LEGACY_MESSAGE_SQL = `INSERT INTO messages (id, user_id, account_id, mailbox_id, thread_id, uid, "references", to_addresses, cc_addresses, bcc_addresses, reply_to_addresses, subject, date, snippet, text_body, seen, flagged, answered, attachments, headers) VALUES ($1, $2, $3, $4, $5, $6, '{}', '[]', '[]', '[]', '[]', 'Stará pošta', now(), 'Starý mail', $7, false, false, false, '[]', '{}')`;

describe('message placements migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-placements-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0036_message_placements');
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

  it('gives every legacy message one placement and keeps its labels and search', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const { user, account } = await seedLegacyAccount(database.url, repositories);
    const mailboxes = ROLES.map((role) =>
      buildMailbox(account.id, role, { path: `legacy-${role}`, name: role }),
    );
    await insertLegacyMailboxes(database.url, user.id, mailboxes);
    const labelId = newId('label');
    const ids = ROLES.map((role) => `msg-${role}-${account.id}`);
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    for (const [index, mailbox] of mailboxes.entries()) {
      await client.query(LEGACY_MESSAGE_SQL, [
        ids[index],
        user.id,
        account.id,
        mailbox.id,
        newId('thread'),
        index + 1,
        `Vianoce ${mailbox.role}`,
      ]);
    }
    await client.query(
      `INSERT INTO labels (id, user_id, account_id, name, color, kind, remote_name) VALUES ($1, $2, $3, $4, null, 'keyword', $4)`,
      [labelId, user.id, account.id, 'Faktúry'],
    );
    await client.query(
      'INSERT INTO message_labels (message_id, label_id, user_id) VALUES ($1, $2, $3)',
      [ids[0], labelId, user.id],
    );

    await runMigrations({ databaseUrl: database.url });

    const placements = await client.query<{ message_id: string; mailbox_id: string; uid: string }>(
      'SELECT message_id, mailbox_id, uid::text FROM message_placements ORDER BY uid',
    );
    expect(placements.rows).toEqual(
      mailboxes.map((mailbox, index) => ({
        message_id: ids[index],
        mailbox_id: mailbox.id,
        uid: String(index + 1),
      })),
    );
    const searched = await client.query<{ hits: string }>(
      `SELECT count(*)::text AS hits FROM messages WHERE search_vector @@ to_tsquery('simple', 'vianoce')`,
    );
    expect(searched.rows).toEqual([{ hits: String(ROLES.length) }]);
    await client.end();
    await expect(
      repositories.messages.findById(user.id, MessageIdSchema.parse(ids[0])),
    ).resolves.toMatchObject({
      labelIds: [labelId],
      placements: [{ mailboxId: mailboxes[0]?.id, uid: 1 }],
    });
  });
});
