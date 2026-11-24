import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Mailbox, MailboxRole } from '@relay/shared/domain';
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
import { buildMailbox, newId } from './support/fixtures';
import { insertLegacyMailboxes, seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const ROLES: readonly MailboxRole[] = ['inbox', 'archive', 'sent', 'drafts', 'spam', 'custom'];

const LEGACY_MESSAGE_SQL = `INSERT INTO messages (id, user_id, account_id, mailbox_id, thread_id, uid, "references", to_addresses, cc_addresses, bcc_addresses, reply_to_addresses, subject, normalized_subject, date, snippet, text_body, seen, flagged, answered, attachments, headers) VALUES ($1, $2, $3, $4, $5, $6, '{}', '[]', '[]', '[]', '[]', 'Stará pošta', 'stará pošta', now(), 'Starý mail', $7, false, false, false, '[]', '{}')`;

const PLACEMENT_SQL =
  'INSERT INTO message_placements (message_id, mailbox_id, uid) VALUES ($1, $2, $3)';

interface GateRow {
  readonly id: string;
  readonly jira: boolean;
  readonly invite: boolean;
}

const gatesOf = async (client: pg.Client): Promise<Record<string, Omit<GateRow, 'id'>>> => {
  const { rows } = await client.query<GateRow>(
    'SELECT id, jira_effects_at IS NOT NULL AS jira, invite_effects_at IS NOT NULL AS invite FROM messages ORDER BY id',
  );
  return Object.fromEntries(rows.map((row) => [row.id, { jira: row.jira, invite: row.invite }]));
};

const ctidOf = async (client: pg.Client, id: string): Promise<string | undefined> => {
  const { rows } = await client.query<{ ctid: string }>(
    'SELECT ctid::text AS ctid FROM messages WHERE id = $1',
    [id],
  );
  return rows[0]?.ctid;
};

const searchHits = async (client: pg.Client): Promise<number> => {
  const { rows } = await client.query<{ hits: number }>(
    `SELECT count(*)::int AS hits FROM messages WHERE search_vector @@ to_tsquery('simple', 'vianoce')`,
  );
  return rows[0]?.hits ?? 0;
};

describe('message effect gates migration on an existing database', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-gates-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0037_message_effect_gates');
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

  it('closes each gate only on rows whose placements accept that effect', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const { user, account } = await seedLegacyAccount(
      database.url,
      createPgRepositories(connection.db),
    );
    const boxes = new Map<MailboxRole, Mailbox>(
      ROLES.map((role) => [role, buildMailbox(account.id, role, { path: `legacy-${role}` })]),
    );
    await insertLegacyMailboxes(database.url, user.id, [...boxes.values()]);
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    onTestFinished(() => client.end());
    const legacy = async (id: string, role: MailboxRole, uid: number): Promise<void> => {
      const mailboxId = boxes.get(role)?.id;
      expect(mailboxId).toBeDefined();
      await client.query(LEGACY_MESSAGE_SQL, [
        id,
        user.id,
        account.id,
        mailboxId,
        newId('thread'),
        uid,
        `Vianoce ${id}`,
      ]);
      await client.query(PLACEMENT_SQL, [id, mailboxId, uid]);
    };
    for (const [index, role] of ROLES.entries()) {
      await legacy(`msg-${role}`, role, index + 1);
    }
    await legacy('msg-spam-inbox', 'spam', 20);
    await client.query(PLACEMENT_SQL, ['msg-spam-inbox', boxes.get('inbox')?.id, 20]);
    const hits = await searchHits(client);
    const inboxRow = await ctidOf(client, 'msg-inbox');

    await runMigrations({ databaseUrl: database.url });

    await expect(gatesOf(client)).resolves.toEqual({
      'msg-archive': { jira: true, invite: true },
      'msg-custom': { jira: false, invite: false },
      'msg-drafts': { jira: true, invite: false },
      'msg-inbox': { jira: true, invite: true },
      'msg-sent': { jira: true, invite: true },
      'msg-spam': { jira: false, invite: false },
      'msg-spam-inbox': { jira: true, invite: true },
    });
    await expect(ctidOf(client, 'msg-inbox')).resolves.toBe(inboxRow);
    expect(hits).toBe(ROLES.length + 1);
    await expect(searchHits(client)).resolves.toBe(hits);
    const defaults = await client.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = 'messages' AND column_name IN ('jira_effects_at', 'invite_effects_at')
       ORDER BY column_name`,
    );
    expect(defaults.rows).toEqual([
      { column_name: 'invite_effects_at', column_default: null },
      { column_name: 'jira_effects_at', column_default: null },
    ]);
    const index = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'messages_mailbox_uid_unique'`,
    );
    expect(index.rows[0]?.indexdef).toContain('WHERE (uid > 0)');
  });
});
