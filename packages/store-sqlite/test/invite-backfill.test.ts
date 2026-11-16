import type { CalendarBackfillWork } from '@relay/engine';
import { AttachmentIdSchema, type AttachmentMeta, type Mailbox } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase } from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedLegacyAccount } from './support/legacy-account';
import { seedAccount } from './support/seed';
import { createTempDirectory, createTestStore, type TempDirectory } from './support/test-database';

const attachment = (contentType: string, filename: string | null): AttachmentMeta => ({
  id: AttachmentIdSchema.parse(`att-${contentType.replace(/[^a-z]/gi, '-')}`),
  filename,
  contentType,
  size: 10,
  contentId: null,
  inline: false,
});

describe('calendar invitation back-fill storage', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('lists stored messages with calendar parts after a UID in UID order', async () => {
    const store = createTestStore();
    const { account, inbox, sent } = await seedAccount(store.repositories);
    const message = (id: string, uid: number, meta: AttachmentMeta, mailbox: Mailbox = inbox) =>
      store.repositories.messages.upsert(
        buildMessage({
          id: messageId(id),
          threadId: threadId(`thr-${id}`),
          accountId: account.id,
          mailboxId: mailbox.id,
          uid,
          attachments: [meta],
        }),
        NO_HEADERS,
      );
    await message('m1', 1, attachment('text/calendar', null));
    await message('m2', 2, attachment('application/pdf', 'offer.pdf'));
    await message('m3', 3, attachment('application/octet-stream', 'Invite.ICS'));
    await message('m4', 4, attachment('APPLICATION/ICS', null));
    await message('m5', 5, attachment('text/calendar', null), sent);

    const first = await store.repositories.inviteCandidates.listAfter(inbox.id, 0, 2);
    const rest = await store.repositories.inviteCandidates.listAfter(inbox.id, 3, 10);

    expect(first).toEqual([
      { messageId: 'm1', threadId: 'thr-m1', uid: 1 },
      { messageId: 'm3', threadId: 'thr-m3', uid: 3 },
    ]);
    expect(rest).toEqual([{ messageId: 'm4', threadId: 'thr-m4', uid: 4 }]);
    store.database.close();
  });

  it('seeds one back-fill entry per existing mail-carrying mailbox when migrating', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0011_calendar_invite_backfill', directory.path),
    });
    const repositories = createSqliteRepositories(database);
    const { account, inbox, sent } = await seedLegacyAccount(database, repositories);
    database.sqlite
      .prepare(
        `insert into mailboxes (id, account_id, name, path, role, unread_count, total_count) values ('mbx-drafts', ?, 'Drafts', 'Drafts', 'drafts', 0, 0)`,
      )
      .run(account.id);

    migrate(database);

    const work = await repositories.pendingWork.list(account.id, 'calendar-backfill');
    const byMailbox = (a: CalendarBackfillWork, b: CalendarBackfillWork) =>
      a.mailboxId.localeCompare(b.mailboxId);
    expect(work.map((entry) => entry.payload).sort(byMailbox)).toEqual(
      [
        { mailboxId: inbox.id, afterUid: 0 },
        { mailboxId: sent.id, afterUid: 0 },
      ].sort(byMailbox),
    );
    expect(work.every((entry) => /^\d{4}-\d{2}-\d{2}T.*Z$/.test(entry.createdAt))).toBe(true);
    database.close();
  });
});
