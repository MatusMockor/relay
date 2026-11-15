import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src';
import type { SqliteDatabase } from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  tempDatabasePath,
  type TestStore,
} from './support/test-database';
import { createSqliteRepositories } from '../src';

const window = (since: string, until: string) => ({
  since: new Date(since),
  until: new Date(until),
});

describe('SqliteMessageRepository.findThreadIdBySubject', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('finds the newest thread with the normalized subject inside the window', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      buildMessage({
        id: messageId('m-old'),
        uid: 1,
        threadId: threadId('thr-old'),
        mailboxId: seeded.inbox.id,
        subject: 'Faktúra za október',
        date: '2026-11-01T10:00:00.000Z',
      }),
      NO_HEADERS,
    );
    await messages.upsert(
      buildMessage({
        id: messageId('m-new'),
        uid: 2,
        threadId: threadId('thr-new'),
        mailboxId: seeded.inbox.id,
        subject: 'RE: [EXTERNAL] Faktúra   za október',
        date: '2026-11-09T10:00:00.000Z',
      }),
      NO_HEADERS,
    );

    const subject = 'faktúra za október';
    expect(
      await messages.findThreadIdBySubject(
        seeded.account.id,
        subject,
        window('2026-10-30T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
      ),
    ).toBe('thr-new');
    expect(
      await messages.findThreadIdBySubject(
        seeded.account.id,
        subject,
        window('2026-10-30T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
      ),
    ).toBe('thr-old');
    expect(
      await messages.findThreadIdBySubject(
        seeded.account.id,
        subject,
        window('2026-11-10T00:00:00.000Z', '2026-11-20T00:00:00.000Z'),
      ),
    ).toBeNull();
    expect(
      await messages.findThreadIdBySubject(
        seeded.account.id,
        'iný predmet',
        window('2026-10-30T00:00:00.000Z', '2026-11-10T00:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('never matches messages of another account', async () => {
    const other = await seedAccount(store.repositories, {
      id: seeded.account.id.replace('acc', 'acc-other') as typeof seeded.account.id,
      email: 'other@firma.sk',
    });
    await store.repositories.messages.upsert(
      buildMessage({
        accountId: other.account.id,
        mailboxId: other.inbox.id,
        subject: 'Zmluva',
      }),
      NO_HEADERS,
    );

    expect(
      await store.repositories.messages.findThreadIdBySubject(
        seeded.account.id,
        'zmluva',
        window('2026-11-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z'),
      ),
    ).toBeNull();
  });
});

describe('normalized subject backfill', () => {
  const opened: SqliteDatabase[] = [];
  const directories: TempDirectory[] = [];

  afterEach(() => {
    opened.splice(0).forEach((database) => {
      database.close();
    });
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('fills subjects of messages stored before the column existed on the next migrate', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const path = tempDatabasePath(directory);
    const first = openDatabase(path);
    migrate(first);
    const seeded = await seedAccount(createSqliteRepositories(first));
    await createSqliteRepositories(first).messages.upsert(
      buildMessage({ mailboxId: seeded.inbox.id, subject: 'Fwd: Ponuka' }),
      NO_HEADERS,
    );
    first.sqlite.prepare('update messages set normalized_subject = null').run();
    first.close();

    const second = openDatabase(path);
    opened.push(second);
    migrate(second);

    expect(
      await createSqliteRepositories(second).messages.findThreadIdBySubject(
        seeded.account.id,
        'ponuka',
        window('2026-11-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z'),
      ),
    ).toBe('thr-1');
  });
});
