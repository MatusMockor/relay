import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectMergeInvariants } from './support/merge-invariants';
import { insertPending } from './support/merge-references-seed';
import { insertCopy, type MergeAccount, seedMergeAccount } from './support/merge-seed';
import { messageCount } from './support/place-fixtures';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  type TestStore,
  tempDatabasePath,
} from './support/test-database';

const SNAPSHOT_TABLES = [
  'messages',
  'message_placements',
  'message_labels',
  'message_aliases',
  'automation_runs',
  'pending_work',
  'messages_fts',
] as const;

const snapshot = (store: TestStore): string =>
  JSON.stringify(
    SNAPSHOT_TABLES.map((table) =>
      store.database.sqlite.prepare(`select * from ${table} order by rowid`).all(),
    ),
  );

const seedGroups = (store: TestStore, account: MergeAccount, count: number): void => {
  const { inbox, allMail } = account.boxes;
  for (let index = 1; index <= count; index += 1) {
    const emailId = `gm-${String(index).padStart(3, '0')}`;
    insertCopy(store, account, { id: `k-${String(index)}`, mailbox: inbox, uid: index, emailId });
    insertCopy(store, account, { id: `l-${String(index)}`, mailbox: allMail, uid: index, emailId });
    insertPending(store, account, {
      kind: 'provider-op',
      ref: `l-${String(index)}:flag:seen`,
      payload: {
        messageId: `l-${String(index)}`,
        change: { kind: 'flag', flag: 'seen', value: true },
      },
    });
  }
};

describe('SqliteMessageMerges interruption', () => {
  let directory: TempDirectory;
  let store: TestStore;
  let account: MergeAccount;

  const mergeNext = async (after: string | null) => {
    const accountId = account.seeded.account.id;
    const chunk = await store.repositories.messageMerges.nextGroups(accountId, after, 4);
    await store.unitOfWork.run((repositories) =>
      repositories.messageMerges.merge(accountId, chunk.groups),
    );
    return chunk.last;
  };

  beforeEach(async () => {
    directory = createTempDirectory();
    store = createTestStore(tempDatabasePath(directory));
    account = await seedMergeAccount(store);
    seedGroups(store, account, 5);
  });

  afterEach(() => {
    store.database.close();
    directory.remove();
  });

  it('rolls the whole chunk back when a statement fails and merges it on the next run', async () => {
    const before = snapshot(store);
    store.database.sqlite.exec(
      `create temp trigger merge_boom before delete on messages when old.id = 'l-2'
       begin select raise(abort, 'boom'); end`,
    );

    await expect(mergeNext(null)).rejects.toMatchObject({ cause: { message: 'boom' } });

    expect(snapshot(store)).toBe(before);
    store.database.sqlite.exec('drop trigger merge_boom');
    const last = await mergeNext(null);
    expect(last).toBe('gm-002');
    expect(messageCount(store)).toBe(8);
    expectMergeInvariants(store);
  });

  it('resumes from the cursor after the database was closed between chunks', async () => {
    const last = await mergeNext(null);
    store.database.close();
    store = createTestStore(tempDatabasePath(directory));

    await mergeNext(await mergeNext(last));

    expect(messageCount(store)).toBe(5);
    expect(
      (await store.repositories.messageMerges.nextGroups(account.seeded.account.id, null, 500))
        .groups,
    ).toEqual([]);
    expectMergeInvariants(store);
  });
});
