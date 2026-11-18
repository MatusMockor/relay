import { AutomationIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { createSqliteRepositories, LOCAL_USER_ID, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory } from './support/test-database';

const AI = { runner: 'claude', model: null, effort: null, instructions: null };

describe('automation action objects migration', () => {
  it('turns stored action names into action objects', async () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0024_automation_action_objects', directory.path),
    });
    const insert = database.sqlite.prepare(
      'insert into automations (id, user_id, account_id, name, enabled, position, preset, conditions, ai, actions) values (?, ?, null, ?, 1, ?, ?, ?, ?, ?)',
    );
    insert.run(
      'automation-jira',
      LOCAL_USER_ID,
      'Jira tasky',
      0,
      'jiraTasks',
      JSON.stringify([{ type: 'jira', projectKeys: [] }]),
      JSON.stringify(AI),
      JSON.stringify(['task']),
    );
    insert.run(
      'automation-tibor',
      LOCAL_USER_ID,
      'Tibor',
      1,
      null,
      JSON.stringify([{ type: 'fromAddress', address: 'tibor@efabrica.sk' }]),
      JSON.stringify(AI),
      JSON.stringify(['summary', 'notify', 'archive']),
    );

    migrate(database);

    const automations =
      await createSqliteRepositories(database).automations.listByUser(LOCAL_USER_ID);
    expect(automations.map((automation) => [automation.id, automation.actions])).toEqual([
      [AutomationIdSchema.parse('automation-jira'), [{ type: 'task' }]],
      [
        AutomationIdSchema.parse('automation-tibor'),
        [{ type: 'summary' }, { type: 'notify' }, { type: 'archive' }],
      ],
    ]);
    database.close();
    directory.remove();
  });
});
