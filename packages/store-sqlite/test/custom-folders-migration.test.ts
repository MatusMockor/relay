import { AccountIdSchema, LabelIdSchema, MailboxIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { insertLegacyAccount } from './support/legacy-account';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, type TempDirectory } from './support/test-database';

describe('custom folders migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('backfills label remote names and defaults mailboxes to subscribed', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0023_custom_folders', directory.path),
    });
    const account = insertLegacyAccount(database, { id: AccountIdSchema.parse('acc-old') });
    database.sqlite
      .prepare(
        `insert into mailboxes (id, account_id, name, path, delimiter, role, unread_count, total_count) values (?, ?, ?, ?, ?, ?, 0, 0)`,
      )
      .run('mbx-old', account.id, 'Projekty', 'Projekty', '/', 'custom');
    database.sqlite
      .prepare(`insert into labels (id, account_id, name, color) values (?, ?, ?, ?)`)
      .run('l-old', account.id, 'Faktury', null);

    migrate(database);

    const repositories = createSqliteRepositories(database);
    expect(await repositories.mailboxes.findById(MailboxIdSchema.parse('mbx-old'))).toMatchObject({
      path: 'Projekty',
      subscribed: true,
      uidValidity: null,
    });
    expect(await repositories.labels.findById(LOCAL_USER_ID, LabelIdSchema.parse('l-old'))).toEqual(
      {
        id: 'l-old',
        accountId: account.id,
        name: 'Faktury',
        color: null,
        kind: 'keyword',
        remoteName: 'Faktury',
      },
    );
    database.close();
  });
});
