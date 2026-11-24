import { describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory } from './support/test-database';

describe('automation match mode migration', () => {
  it('reads rules stored before the migration as all conditions without exceptions', async () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0032_automation_match_mode', directory.path),
    });
    database.sqlite
      .prepare(
        'insert into automations (id, user_id, account_id, name, enabled, position, preset, conditions, ai, actions) values (?, ?, null, ?, 1, 0, null, ?, ?, ?)',
      )
      .run(
        'automation-tibor',
        LOCAL_USER_ID,
        'Tibor',
        JSON.stringify([{ type: 'fromAddress', address: 'tibor@efabrica.sk' }]),
        JSON.stringify({ runner: 'claude', model: null, effort: null, instructions: null }),
        JSON.stringify([{ type: 'pin' }]),
      );

    migrate(database);

    const { automations } = createSqliteRepositories(database);
    expect(await automations.listByUser(LOCAL_USER_ID)).toMatchObject([
      {
        name: 'Tibor',
        match: 'all',
        conditions: [{ type: 'fromAddress', address: 'tibor@efabrica.sk' }],
        exceptions: [],
      },
    ]);
    database.close();
    directory.remove();
  });
});
