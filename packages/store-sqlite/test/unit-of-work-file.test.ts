import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID, openDatabase, type SqliteDatabase } from '../src';
import { createDeferred } from './support/deferred';
import { buildAccount } from './support/fixtures';
import {
  createTempDirectory,
  createTestStore,
  type TempDirectory,
  tempDatabasePath,
  type TestStore,
} from './support/test-database';

const countAccounts = (database: SqliteDatabase): unknown =>
  database.sqlite.prepare('select count(*) as count from accounts').get();

describe('SqliteUnitOfWork on a file database', () => {
  let directory: TempDirectory;
  let store: TestStore;
  let reader: SqliteDatabase;

  beforeEach(() => {
    directory = createTempDirectory();
    store = createTestStore(tempDatabasePath(directory));
    reader = openDatabase(tempDatabasePath(directory), { readonly: true });
  });

  afterEach(() => {
    reader.close();
    store.database.close();
    directory.remove();
  });

  it('hides uncommitted writes from other connections until commit', async () => {
    const release = createDeferred();
    const unit = store.unitOfWork.run(async (repositories) => {
      await repositories.accounts.create(buildAccount());
      await release.promise;
    });

    await new Promise((done) => {
      setTimeout(done, 5);
    });
    expect(countAccounts(reader)).toEqual({ count: 0 });
    release.resolve();
    await unit;

    expect(countAccounts(reader)).toEqual({ count: 1 });
    expect(await store.repositories.accounts.listByUser(LOCAL_USER_ID)).toHaveLength(1);
  });
});
