import type { CalendarRebuildWork } from '@relay/engine';
import { AccountIdSchema, MessageIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedLegacyAccount } from './support/legacy-account';
import { createTempDirectory, type TempDirectory } from './support/test-database';

const NOW = '2026-11-16T08:00:00.000Z';

describe('calendar invitation rebuild migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('seeds one rebuild cursor per mail-carrying mailbox and drops parked replies', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0019_calendar_invite_rebuild', directory.path),
    });
    const repositories = createSqliteRepositories(database);
    const { account, inbox, sent } = await seedLegacyAccount(database);
    database.sqlite
      .prepare(
        `insert into mailboxes (id, account_id, name, path, role, unread_count, total_count) values ('mbx-spam', ?, 'Spam', 'Spam', 'spam', 0, 0)`,
      )
      .run(account.id);
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
      ref: inbox.id,
      payload: { mailboxId: inbox.id, afterUid: 7 },
      createdAt: NOW,
    });

    migrate(database);

    const cursors = await repositories.pendingWork.list(account.id, 'calendar-rebuild');
    const byMailbox = (a: CalendarRebuildWork, b: CalendarRebuildWork) =>
      a.mailboxId.localeCompare(b.mailboxId);
    expect(cursors.map((entry) => entry.payload).sort(byMailbox)).toEqual(
      [
        { mailboxId: inbox.id, afterUid: 0 },
        { mailboxId: sent.id, afterUid: 0 },
      ].sort(byMailbox),
    );
    expect(await repositories.pendingWork.list(account.id, 'calendar-reply')).toEqual([]);
    expect(
      (await repositories.pendingWork.list(account.id, 'calendar-backfill')).map(
        (entry) => entry.payload,
      ),
    ).toEqual([{ mailboxId: inbox.id, afterUid: 7 }]);
    expect(
      await repositories.pendingWork.list(AccountIdSchema.parse('acc-other'), 'calendar-rebuild'),
    ).toEqual([]);
    database.close();
  });
});
