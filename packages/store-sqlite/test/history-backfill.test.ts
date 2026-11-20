import type { HistoryCursor } from '@relay/engine';
import type { Mailbox } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSqliteHistoryBackfills,
  createSqliteRepositories,
  migrate,
  openDatabase,
  type SqliteDatabase,
} from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { insertLegacyMessage } from './support/legacy-message';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedAccount } from './support/seed';
import { createTempDirectory, createTestStore, type TempDirectory } from './support/test-database';

type Repositories = ReturnType<typeof createSqliteRepositories>;

const storeUids = async (repositories: Repositories, mailbox: Mailbox, uids: readonly number[]) => {
  for (const uid of uids) {
    await repositories.messages.upsert(
      buildMessage({
        id: messageId(`${mailbox.id}-${String(uid)}`),
        threadId: threadId(`thr-${mailbox.id}-${String(uid)}`),
        mailboxId: mailbox.id,
        accountId: mailbox.accountId,
        uid,
        messageIdHeader: `<${mailbox.id}-${String(uid)}@klient.sk>`,
      }),
      NO_HEADERS,
    );
  }
};

const bodyStateColumn = (database: SqliteDatabase, id: string): string | undefined =>
  database.sqlite
    .prepare<[string], { body_state: string }>('select body_state from messages where id = ?')
    .get(id)?.body_state;

const ftsMatches = (database: SqliteDatabase, term: string): number =>
  database.sqlite
    .prepare<
      [string],
      { count: number }
    >('select count(*) as count from messages_fts where messages_fts match ?')
    .get(term)?.count ?? 0;

describe('history backfill storage', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('marks every message stored before the migration as local', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0029_history_backfill', directory.path),
    });
    const repositories = createSqliteRepositories(database);
    const { account, inbox } = await seedAccount(repositories);
    insertLegacyMessage(database, { id: 'msg-1', userId: account.userId, mailbox: inbox, uid: 1 });

    migrate(database);

    expect(bodyStateColumn(database, 'msg-1')).toBe('local');
    const stored = await repositories.messages.findById(account.userId, messageId('msg-1'));
    expect(stored).not.toBeNull();
    expect(stored?.bodyState).toBeUndefined();
    database.close();
  });

  it('round trips remote body state and keeps header-only rows searchable', async () => {
    const store = createTestStore();
    const { account, inbox } = await seedAccount(store.repositories);
    await store.repositories.messages.upsert(
      buildMessage({
        id: messageId('remote'),
        accountId: account.id,
        mailboxId: inbox.id,
        subject: 'Zmluva o dielo',
        from: { name: 'Mária Kováčová', email: 'maria@stavba.sk' },
        snippet: 'Posielam podpísanú prílohu',
        textBody: null,
        htmlBody: null,
        bodyState: 'remote',
      }),
      NO_HEADERS,
    );

    const stored = await store.repositories.messages.findById(account.userId, messageId('remote'));

    expect(stored).toMatchObject({ bodyState: 'remote', textBody: null, htmlBody: null });
    expect(bodyStateColumn(store.database, 'remote')).toBe('remote');
    expect(ftsMatches(store.database, 'zmluva')).toBe(1);
    expect(ftsMatches(store.database, 'kovacova')).toBe(1);
    expect(ftsMatches(store.database, 'podpisanu')).toBe(1);
    store.database.close();
  });

  it('saves, updates and reads history cursors and lists stored UIDs', async () => {
    const store = createTestStore();
    const { account, inbox, sent } = await seedAccount(store.repositories);
    const backfills = createSqliteHistoryBackfills(store.database);
    await storeUids(store.repositories, inbox, [3, 5, 9]);
    await storeUids(store.repositories, sent, [5]);
    const cursor: HistoryCursor = {
      mailboxId: inbox.id,
      accountId: account.id,
      uidValidity: 7,
      belowUid: 1201,
      doneAt: null,
      updatedAt: '2026-11-15T10:00:00.000Z',
    };

    expect(await backfills.find(inbox.id)).toBeNull();
    await backfills.save(cursor);
    await backfills.save({ ...cursor, belowUid: 1, doneAt: '2026-11-15T10:05:00.000Z' });

    expect(await backfills.find(inbox.id)).toEqual({
      ...cursor,
      belowUid: 1,
      doneAt: '2026-11-15T10:05:00.000Z',
    });
    expect(await backfills.storedUids(inbox.id, [9, 1, 5, 4, 5])).toEqual([5, 9]);
    expect(await backfills.storedUids(inbox.id, [])).toEqual([]);
    expect(await backfills.countsByMailbox(account.id)).toEqual(
      [
        { mailboxId: inbox.id, stored: 3 },
        { mailboxId: sent.id, stored: 1 },
      ].sort((left, right) => left.mailboxId.localeCompare(right.mailboxId)),
    );
    store.database.sqlite.prepare('delete from mailboxes where id = ?').run(inbox.id);
    expect(await backfills.find(inbox.id)).toBeNull();
    store.database.close();
  });
});
