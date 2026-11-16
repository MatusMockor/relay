import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentIdSchema, type AttachmentMeta } from '@relay/shared/domain';
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
import { buildMailbox, buildMessage, seedAccount, seedThread } from './support/fixtures';
import { seedLegacyAccount } from './support/legacy-account';
import { usePgTestContext } from './support/pg-test-context';
import { createTestDatabase, type TestDatabase } from './support/test-database';

const attachment = (contentType: string, filename: string | null): AttachmentMeta => ({
  id: AttachmentIdSchema.parse(`att-${contentType.replace(/[^a-z]/gi, '-')}`),
  filename,
  contentType,
  size: 10,
  contentId: null,
  inline: false,
});

describe('PgInviteCandidateRepository', () => {
  const context = usePgTestContext();

  it('lists stored messages with calendar parts after a UID in UID order', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread } = await seedThread(context.repositories, seeded);
    const { inbox, sent } = seeded.mailboxes;
    const store = (uid: number, meta: AttachmentMeta, mailbox = inbox) =>
      context.repositories.messages.upsert(
        buildMessage(thread, mailbox, { uid, attachments: [meta] }),
        new Map(),
      );
    const first = await store(1001, attachment('text/calendar', null));
    await store(1002, attachment('application/pdf', 'offer.pdf'));
    const third = await store(1003, attachment('application/octet-stream', 'Invite.ICS'));
    const fourth = await store(1004, attachment('APPLICATION/ICS', null));
    await store(1005, attachment('text/calendar', null), sent);

    const page = await context.repositories.inviteCandidates.listAfter(inbox.id, 1000, 2);
    const rest = await context.repositories.inviteCandidates.listAfter(inbox.id, 1003, 10);

    expect(page).toEqual([
      { messageId: first.id, threadId: thread.id, uid: 1001, date: first.date },
      { messageId: third.id, threadId: thread.id, uid: 1003, date: third.date },
    ]);
    expect(rest).toEqual([
      { messageId: fourth.id, threadId: thread.id, uid: 1004, date: fourth.date },
    ]);
  });
});

describe('calendar invitation back-fill migration', () => {
  let database: TestDatabase;
  let folder: string;
  let connection: PostgresConnection | undefined;

  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
    folder = mkdtempSync(join(tmpdir(), 'relay-drizzle-backfill-'));
    cpSync(DEFAULT_MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    const end = journal.entries.findIndex((entry) => entry.tag === '0013_calendar_invite_backfill');
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

  it('seeds one back-fill entry per existing mail-carrying mailbox', async () => {
    await runMigrations({ databaseUrl: database.url, migrationsFolder: folder });
    connection = openPostgresConnection({ url: database.url, maxConnections: 2 });
    const repositories = createPgRepositories(connection.db);
    const seeded = await seedLegacyAccount(database.url, repositories);
    await repositories.mailboxes.upsertMany(seeded.account.id, [
      buildMailbox(seeded.account.id, 'drafts'),
    ]);

    await runMigrations({ databaseUrl: database.url });

    const work = await repositories.pendingWork.list(seeded.account.id, 'calendar-backfill');
    expect(work.map((entry) => entry.payload.mailboxId).sort()).toEqual(
      [seeded.mailboxes.inbox.id, seeded.mailboxes.sent.id].sort(),
    );
    expect(work.every((entry) => entry.payload.afterUid === 0)).toBe(true);
  });
});
