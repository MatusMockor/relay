import { describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory } from './support/test-database';

describe('removed automation presets migration', () => {
  it('keeps stored presets and starts with no removed presets', async () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0026_removed_automation_presets', directory.path),
    });
    database.sqlite
      .prepare(
        'insert into automations (id, user_id, account_id, name, enabled, position, preset, conditions, ai, actions) values (?, ?, null, ?, 1, 0, ?, ?, ?, ?)',
      )
      .run(
        'automation-jira',
        LOCAL_USER_ID,
        'Jira tasky',
        'jiraTasks',
        JSON.stringify([{ type: 'jira', projectKeys: [] }]),
        JSON.stringify({ runner: 'claude', model: null, effort: null, instructions: null }),
        JSON.stringify([{ type: 'task' }]),
      );

    migrate(database);

    const { automations } = createSqliteRepositories(database);
    expect(
      (await automations.listByUser(LOCAL_USER_ID)).map((item) => [item.preset, item.enabled]),
    ).toEqual([['jiraTasks', true]]);
    expect(await automations.isPresetRemoved(LOCAL_USER_ID, 'jiraTasks')).toBe(false);
    await automations.markPresetRemoved(LOCAL_USER_ID, 'jiraTasks');
    expect(await automations.isPresetRemoved(LOCAL_USER_ID, 'jiraTasks')).toBe(true);
    database.close();
    directory.remove();
  });
});
