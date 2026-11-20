import type { HistoryCursor } from '@relay/engine';
import type { Mailbox } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSqliteHistoryBackfills,
  createSqliteRepositories,
  migrate,
  openDatabase,
} from '../src';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedAccount } from './support/seed';
import { createTempDirectory, createTestStore, type TempDirectory } from './support/test-database';

const cursorOf = (mailbox: Mailbox): HistoryCursor => ({
  mailboxId: mailbox.id,
  accountId: mailbox.accountId,
  uidValidity: 7,
  belowUid: 1201,
  doneAt: null,
  updatedAt: '2026-11-15T10:00:00.000Z',
});

describe('history flag scan offset storage', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('persists the rotating flag scan offset on the cursor row and keeps it across cursor saves', async () => {
    const store = createTestStore();
    const { inbox, sent } = await seedAccount(store.repositories);
    const backfills = createSqliteHistoryBackfills(store.database);

    await backfills.saveFlagScanOffset(inbox.id, 40);
    expect(await backfills.flagScanOffset(inbox.id)).toBeNull();

    await backfills.save(cursorOf(inbox));
    expect(await backfills.flagScanOffset(inbox.id)).toBe(0);
    await backfills.saveFlagScanOffset(inbox.id, 40);
    await backfills.save({ ...cursorOf(inbox), belowUid: 1, doneAt: '2026-11-15T10:05:00.000Z' });

    expect(await backfills.flagScanOffset(inbox.id)).toBe(40);
    expect(await backfills.flagScanOffset(sent.id)).toBeNull();
    expect(await createSqliteHistoryBackfills(store.database).flagScanOffset(inbox.id)).toBe(40);
    store.database.close();
  });

  it('adds the offset column with a zero default to cursors saved before the migration', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0030_history_flag_scan_offset', directory.path),
    });
    const { inbox } = await seedAccount(createSqliteRepositories(database));
    database.sqlite
      .prepare(
        'insert into history_backfill (mailbox_id, account_id, uid_validity, below_uid, done_at, updated_at) values (?, ?, 7, 1, null, ?)',
      )
      .run(inbox.id, inbox.accountId, '2026-11-15T10:00:00.000Z');

    migrate(database);

    const backfills = createSqliteHistoryBackfills(database);
    expect(await backfills.flagScanOffset(inbox.id)).toBe(0);
    expect(await backfills.find(inbox.id)).toMatchObject({ belowUid: 1, uidValidity: 7 });
    database.close();
  });
});
