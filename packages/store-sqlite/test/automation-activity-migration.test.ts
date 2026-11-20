import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory } from './support/test-database';

const tableNames = (database: ReturnType<typeof openDatabase>): string[] =>
  database.sqlite
    .prepare("select name from sqlite_master where type in ('table', 'index') order by name")
    .all()
    .map((row) => (row as { name: string }).name);

describe('automation activity migration', () => {
  it('adds the activity table and its index to an existing database', () => {
    const directory = createTempDirectory();
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0033_automation_activity', directory.path),
    });
    expect(tableNames(database)).not.toContain('automation_activity');

    migrate(database);

    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        'automation_activity',
        'automation_activity_user_automation_created_idx',
      ]),
    );
    database.close();
    directory.remove();
  });
});
