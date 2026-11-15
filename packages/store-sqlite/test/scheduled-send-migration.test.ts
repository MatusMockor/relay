import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase } from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedAccount } from './support/seed';
import { createTempDirectory, type TempDirectory } from './support/test-database';

describe('scheduled send lease migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('keeps the oldest active send of a draft and cancels the duplicates', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0005_scheduled_send_lease', directory.path),
    });
    const { account } = await seedAccount(createSqliteRepositories(database));
    const insert = database.sqlite.prepare(
      `insert into scheduled_sends (id, user_id, account_id, draft_id, scheduled_at, scheduled_ts, status, created_at)
       values (?, 'local', ?, ?, '2026-11-12T08:00:00.000Z', 0, ?, ?)`,
    );
    insert.run('sch-new', account.id, 'drf-1', 'pending', '2026-11-10T11:00:00.000Z');
    insert.run('sch-old', account.id, 'drf-1', 'sending', '2026-11-10T10:00:00.000Z');
    insert.run('sch-done', account.id, 'drf-1', 'sent', '2026-11-10T09:00:00.000Z');
    insert.run('sch-other', account.id, 'drf-2', 'pending', '2026-11-10T12:00:00.000Z');

    migrate(database);

    const rows = database.sqlite
      .prepare<
        [],
        { id: string; status: string }
      >('select id, status from scheduled_sends order by id')
      .all();
    expect(rows).toEqual([
      { id: 'sch-done', status: 'sent' },
      { id: 'sch-new', status: 'cancelled' },
      { id: 'sch-old', status: 'sending' },
      { id: 'sch-other', status: 'pending' },
    ]);
    database.close();
  });
});
