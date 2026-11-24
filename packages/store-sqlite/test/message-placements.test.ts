import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteMessageUids, LOCAL_USER_ID } from '../src';
import { buildMailbox, buildMessage, mailboxId, messageId, NO_HEADERS } from './support/fixtures';
import { placementRows } from './support/placement-rows';
import { seedAccount, type SeededAccount } from './support/seed';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  type TestStore,
  tempDatabasePath,
} from './support/test-database';

const locations = [
  { name: 'in memory', file: false },
  { name: 'in a file', file: true },
] as const;

describe.each(locations)('message placements $name', ({ file }) => {
  let directory: TempDirectory | null = null;
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    directory = file ? createTempDirectory() : null;
    store = createTestStore(directory === null ? ':memory:' : tempDatabasePath(directory));
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
    directory?.remove();
  });

  const message = (id: string, uid: number, mailbox = seeded.inbox) =>
    buildMessage({ id: messageId(id), uid, mailboxId: mailbox.id, accountId: seeded.account.id });

  it('stores one placement per upserted message and returns it on reads', async () => {
    const { messages } = store.repositories;
    const stored = await messages.upsert(message('msg-1', 7), NO_HEADERS);
    await messages.upsert({ ...message('msg-1', 8), subject: 'Znova' }, NO_HEADERS);

    expect(stored.placements).toEqual([{ mailboxId: seeded.inbox.id, uid: 7 }]);
    expect(placementRows(store)).toEqual([
      { messageId: 'msg-1', mailboxId: seeded.inbox.id, uid: 8 },
    ]);
    expect((await messages.findById(LOCAL_USER_ID, messageId('msg-1')))?.placements).toEqual([
      { mailboxId: seeded.inbox.id, uid: 8 },
    ]);
    expect(
      (await messages.listByThread(LOCAL_USER_ID, stored.threadId)).map((row) => row.placements),
    ).toEqual([[{ mailboxId: seeded.inbox.id, uid: 8 }]]);
  });

  it('rewrites the placement on move and reads locations through it', async () => {
    const { messages } = store.repositories;
    await messages.upsert(message('msg-1', 7), NO_HEADERS);
    await messages.upsert(message('msg-2', 9), NO_HEADERS);

    await messages.move(messageId('msg-1'), { mailboxId: seeded.sent.id, uid: 0 });

    expect(placementRows(store)).toEqual([
      { messageId: 'msg-1', mailboxId: seeded.sent.id, uid: 0 },
      { messageId: 'msg-2', mailboxId: seeded.inbox.id, uid: 9 },
    ]);
    expect(await messages.findByLocation({ mailboxId: seeded.inbox.id, uid: 7 })).toBeNull();
    expect(await messages.findByLocation({ mailboxId: seeded.sent.id, uid: 0 })).toMatchObject({
      id: 'msg-1',
      mailboxId: seeded.sent.id,
      uid: 0,
    });
    expect(await messages.listUids(seeded.inbox.id)).toEqual([9]);
    expect(await messages.listUids(seeded.sent.id)).toEqual([]);
    expect(
      (await createSqliteMessageUids(store.database).findByUids(seeded.inbox.id, [7, 9])).map(
        (row) => row.id,
      ),
    ).toEqual(['msg-2']);
  });

  it('deletes the messages and placements at the given uids', async () => {
    const { messages } = store.repositories;
    await messages.upsert(message('msg-1', 7), NO_HEADERS);
    await messages.upsert(message('msg-2', 9), NO_HEADERS);

    const threadIds = await messages.deleteByUids(seeded.inbox.id, [7, 8]);

    expect(threadIds).toEqual(['thr-1']);
    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-1'))).toBeNull();
    expect(placementRows(store)).toEqual([
      { messageId: 'msg-2', mailboxId: seeded.inbox.id, uid: 9 },
    ]);
  });

  it('resolves a merged message id through its alias', async () => {
    const { messages } = store.repositories;
    await messages.upsert(message('msg-keeper', 7), NO_HEADERS);
    store.database.sqlite
      .prepare('insert into message_aliases (alias_id, message_id) values (?, ?)')
      .run('msg-merged', 'msg-keeper');

    await messages.updateFlags(messageId('msg-merged'), {
      seen: true,
      flagged: true,
      answered: false,
    });
    await messages.move(messageId('msg-merged'), { mailboxId: seeded.sent.id, uid: 3 });

    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-merged'))).toMatchObject({
      id: 'msg-keeper',
      flags: { seen: true, flagged: true, answered: false },
      placements: [{ mailboxId: seeded.sent.id, uid: 3 }],
    });
    expect(await messages.findHeaders(LOCAL_USER_ID, messageId('msg-merged'))).toEqual(new Map());
  });

  it('cascades placements and aliases when the account goes', async () => {
    const { accounts, messages } = store.repositories;
    await messages.upsert(message('msg-1', 7), NO_HEADERS);
    store.database.sqlite
      .prepare('insert into message_aliases (alias_id, message_id) values (?, ?)')
      .run('msg-old', 'msg-1');

    await accounts.delete(LOCAL_USER_ID, seeded.account.id);

    expect(placementRows(store)).toEqual([]);
    expect(store.database.sqlite.prepare('select * from message_aliases').all()).toEqual([]);
  });

  it('cascades placements when their mailbox goes', async () => {
    const { mailboxes, messages } = store.repositories;
    const [folder] = await mailboxes.upsertMany(seeded.account.id, [
      buildMailbox({
        id: mailboxId('mbx-folder'),
        accountId: seeded.account.id,
        name: 'Projekty',
        path: 'Projekty',
        role: 'custom',
      }),
    ]);
    expect(folder).toBeDefined();
    await messages.upsert(message('msg-1', 7), NO_HEADERS);
    await messages.upsert(message('msg-2', 4, folder ?? seeded.inbox), NO_HEADERS);

    await mailboxes.deleteMissing(seeded.account.id, ['INBOX', 'Sent']);

    expect(placementRows(store)).toEqual([
      { messageId: 'msg-1', mailboxId: seeded.inbox.id, uid: 7 },
    ]);
  });
});
