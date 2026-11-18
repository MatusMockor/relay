import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageIdSchema } from '@relay/shared/domain';
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
import { buildMailbox } from './support/fixtures';
import { insertLegacyMailboxes, seedLegacyAccount } from './support/legacy-account';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const NOW = '2026-11-16T08:00:00.000Z';

describe('calendar invitation rebuild migration', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-rebuild-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0021_calendar_invite_rebuild');
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

  it('seeds one rebuild cursor per mail-carrying mailbox and drops parked replies', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const seeded = await seedLegacyAccount(database.url, repositories);
    const { account, mailboxes } = seeded;
    await insertLegacyMailboxes(database.url, seeded.user.id, [buildMailbox(account.id, 'spam')]);
    await repositories.pendingWork.put({
      accountId: account.id,
      kind: 'calendar-reply',
      ref: 'parked',
      payload: {
        uid: 'weekly@partner.test',
        recurrenceId: null,
        sequence: 0,
        dtstamp: null,
        attendee: { name: null, email: 'jana@partner.test', partstat: 'accepted', role: null },
        messageId: MessageIdSchema.parse('msg-reply'),
        parkedAt: NOW,
      },
      createdAt: NOW,
    });
    await repositories.pendingWork.put({
      accountId: account.id,
      kind: 'calendar-backfill',
      ref: mailboxes.inbox.id,
      payload: { mailboxId: mailboxes.inbox.id, afterUid: 7 },
      createdAt: NOW,
    });

    await runMigrations({ databaseUrl: database.url });

    const cursors = await repositories.pendingWork.list(account.id, 'calendar-rebuild');
    expect(cursors.map((entry) => entry.payload.mailboxId).sort()).toEqual(
      [mailboxes.inbox.id, mailboxes.sent.id].sort(),
    );
    expect(cursors.every((entry) => entry.payload.afterUid === 0)).toBe(true);
    expect(await repositories.pendingWork.list(account.id, 'calendar-reply')).toEqual([]);
    expect(
      (await repositories.pendingWork.list(account.id, 'calendar-backfill')).map(
        (entry) => entry.payload,
      ),
    ).toEqual([{ mailboxId: mailboxes.inbox.id, afterUid: 7 }]);
  });
});
