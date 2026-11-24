import { AccountIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, openDatabase, type SqliteDatabase } from '../src';
import { insertLegacyAccount } from './support/legacy-account';
import { writeMigrationsBefore } from './support/partial-migrations';
import { createTempDirectory, type TempDirectory } from './support/test-database';

interface WorkRow {
  readonly accountId: string;
  readonly ref: string;
  readonly payload: string;
  readonly revision: string;
  readonly createdAt: string;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const copyMergeRows = (database: SqliteDatabase): WorkRow[] =>
  database.sqlite
    .prepare<[], WorkRow>(
      `select account_id as accountId, ref, payload, revision, created_at as createdAt
       from pending_work where kind = 'copy-merge' order by account_id`,
    )
    .all();

describe('copy merge migration', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('enqueues one copy merge per account and keeps an existing row', () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0039_copy_merge', directory.path),
    });
    ['acc-a', 'acc-b', 'acc-c'].forEach((id) => {
      insertLegacyAccount(database, { id: AccountIdSchema.parse(id), email: `${id}@firma.sk` });
    });
    database.sqlite
      .prepare(
        `insert into pending_work (account_id, kind, ref, payload, revision, created_at)
         values ('acc-b', 'copy-merge', 'account', '{"afterEmailId":"gm-9"}', 'rev-kept', '2026-11-01T08:00:00.000Z')`,
      )
      .run();

    migrate(database);
    const rows = copyMergeRows(database);
    migrate(database);

    expect(rows.map(({ accountId, ref }) => [accountId, ref])).toEqual([
      ['acc-a', 'account'],
      ['acc-b', 'account'],
      ['acc-c', 'account'],
    ]);
    expect(rows[1]).toMatchObject({ payload: '{"afterEmailId":"gm-9"}', revision: 'rev-kept' });
    [rows[0], rows[2]].forEach((row) => {
      expect(row?.payload).toBe('{}');
      expect(row?.revision).toMatch(/^[0-9a-f]{32}$/);
      expect(row?.createdAt).toMatch(ISO_TIMESTAMP);
    });
    expect(copyMergeRows(database)).toEqual(rows);
    expect(
      database.sqlite
        .prepare("select name from sqlite_master where name = 'message_aliases_message_idx'")
        .get(),
    ).toEqual({ name: 'message_aliases_message_idx' });
    database.close();
  });
});
