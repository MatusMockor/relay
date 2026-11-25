import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { accountId, buildAccount, userId } from './support/fixtures';
import { insertLegacyAccount } from './support/legacy-account';
import { writeMigrationsBefore } from './support/partial-migrations';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  type TestStore,
} from './support/test-database';

const OTHER_USER = userId('someone-else');

describe('SqliteAccountRepository account order', () => {
  const stores: TestStore[] = [];
  const directories: TempDirectory[] = [];

  afterEach(() => {
    stores.splice(0).forEach((store) => {
      store.database.close();
    });
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  const openStore = (): TestStore => {
    const store = createTestStore();
    stores.push(store);
    return store;
  };

  const seed = async (store: TestStore) => {
    const { accounts } = store.repositories;
    await accounts.create(buildAccount({ id: accountId('acc-1'), email: 'a@firma.sk' }));
    await accounts.create(buildAccount({ id: accountId('acc-2'), email: 'b@firma.sk' }));
    await accounts.create(buildAccount({ id: accountId('acc-3'), email: 'c@firma.sk' }));
    await accounts.create(
      buildAccount({ id: accountId('acc-x'), userId: OTHER_USER, email: 'x@firma.sk' }),
    );
  };

  const ids = async (store: TestStore, owner = LOCAL_USER_ID) =>
    (await store.repositories.accounts.listByUser(owner)).map((account) => account.id);

  it('lists accounts in the stored order and appends new ones', async () => {
    const store = openStore();
    await seed(store);

    const written = await store.repositories.accounts.reorder(LOCAL_USER_ID, [
      accountId('acc-3'),
      accountId('acc-1'),
      accountId('acc-2'),
    ]);
    await store.repositories.accounts.create(
      buildAccount({ id: accountId('acc-4'), email: 'd@firma.sk' }),
    );

    expect(written).toBe(3);
    expect(await ids(store)).toEqual(['acc-3', 'acc-1', 'acc-2', 'acc-4']);
    expect(await ids(store, OTHER_USER)).toEqual(['acc-x']);
    expect((await store.repositories.accounts.listSyncable()).map((account) => account.id)).toEqual(
      ['acc-3', 'acc-x', 'acc-1', 'acc-2', 'acc-4'],
    );
  });

  it('counts only the accounts of the user it moved', async () => {
    const store = openStore();
    await seed(store);
    await store.repositories.accounts.create(
      buildAccount({ id: accountId('acc-y'), userId: OTHER_USER, email: 'y@firma.sk' }),
    );

    const written = await store.repositories.accounts.reorder(LOCAL_USER_ID, [
      accountId('acc-y'),
      accountId('acc-2'),
      accountId('acc-missing'),
      accountId('acc-1'),
      accountId('acc-3'),
    ]);

    expect(written).toBe(3);
    expect(await ids(store)).toEqual(['acc-2', 'acc-1', 'acc-3']);
    expect(await ids(store, OTHER_USER)).toEqual(['acc-x', 'acc-y']);
    expect(
      (await store.repositories.accounts.listByUserForUpdate(LOCAL_USER_ID)).map(
        (account) => account.id,
      ),
    ).toEqual(['acc-2', 'acc-1', 'acc-3']);
  });

  it('keeps the order inside an open unit of work', async () => {
    const store = openStore();
    await seed(store);

    await store.unitOfWork.run(async ({ accounts }) => {
      await accounts.reorder(LOCAL_USER_ID, [
        accountId('acc-2'),
        accountId('acc-3'),
        accountId('acc-1'),
      ]);
      expect((await accounts.listByUser(LOCAL_USER_ID)).map((account) => account.id)).toEqual([
        'acc-2',
        'acc-3',
        'acc-1',
      ]);
    });

    expect(await ids(store)).toEqual(['acc-2', 'acc-3', 'acc-1']);
  });

  it('numbers existing accounts by creation time when migrating', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0040_account_sort_order', directory.path),
    });
    const legacy = [
      { id: 'acc-late', email: 'late@firma.sk', createdAt: '2026-11-03T08:00:00.000Z' },
      { id: 'acc-early', email: 'early@firma.sk', createdAt: '2026-11-01T08:00:00.000Z' },
      { id: 'acc-tie-b', email: 'tie-b@firma.sk', createdAt: '2026-11-02T08:00:00.000Z' },
      { id: 'acc-tie-a', email: 'tie-a@firma.sk', createdAt: '2026-11-02T08:00:00.000Z' },
    ];
    legacy.forEach(({ id, email, createdAt }) => {
      insertLegacyAccount(database, { id: accountId(id), email, createdAt });
    });
    insertLegacyAccount(database, {
      id: accountId('acc-other'),
      userId: OTHER_USER,
      email: 'other@firma.sk',
      createdAt: '2026-11-05T08:00:00.000Z',
    });

    migrate(database);

    const repositories = createSqliteRepositories(database);
    await repositories.accounts.create(
      buildAccount({
        id: accountId('acc-new'),
        email: 'new@firma.sk',
        createdAt: '2026-10-01T08:00:00.000Z',
      }),
    );
    const listed = await repositories.accounts.listByUser(LOCAL_USER_ID);
    expect(listed.map((account) => account.id)).toEqual([
      'acc-early',
      'acc-tie-a',
      'acc-tie-b',
      'acc-late',
      'acc-new',
    ]);
    const positions = database.sqlite
      .prepare('select id, sort_order as position from accounts order by id')
      .all();
    expect(positions).toEqual([
      { id: 'acc-early', position: 0 },
      { id: 'acc-late', position: 3 },
      { id: 'acc-new', position: 4 },
      { id: 'acc-other', position: 0 },
      { id: 'acc-tie-a', position: 1 },
      { id: 'acc-tie-b', position: 2 },
    ]);
    database.close();
  });
});
