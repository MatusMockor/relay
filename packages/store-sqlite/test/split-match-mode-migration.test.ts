import { describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory } from './support/test-database';

const RULES = [{ type: 'fromDomain', domain: 'klient.sk' }];

describe('split match mode migration', () => {
  it('reads splits stored before the migration as any condition without exceptions', async () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0034_split_match_mode', directory.path),
    });
    database.sqlite
      .prepare(
        'insert into splits (id, user_id, account_id, name, position, rules, exclusive) values (?, ?, null, ?, 0, ?, 1)',
      )
      .run('spl-klienti', LOCAL_USER_ID, 'Klienti', JSON.stringify(RULES));

    migrate(database);

    const { splits } = createSqliteRepositories(database);
    expect(await splits.listByUser(LOCAL_USER_ID)).toMatchObject([
      { name: 'Klienti', match: 'any', rules: RULES, exceptions: [] },
    ]);
    database.close();
    directory.remove();
  });
});
