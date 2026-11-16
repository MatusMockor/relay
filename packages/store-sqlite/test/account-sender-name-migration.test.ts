import { AccountIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { insertLegacyAccount } from './support/legacy-account';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, type TempDirectory } from './support/test-database';

describe('account sender name migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('copies the existing account name into the sender name', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0014_account_sender_name', directory.path),
    });
    insertLegacyAccount(database, {
      id: AccountIdSchema.parse('acc-old'),
      displayName: 'Ján Novák',
    });

    migrate(database);

    const repositories = createSqliteRepositories(database);
    const account = await repositories.accounts.findById(
      LOCAL_USER_ID,
      AccountIdSchema.parse('acc-old'),
    );
    expect(account).toMatchObject({ displayName: 'Ján Novák', senderName: 'Ján Novák' });
    database.close();
  });
});
