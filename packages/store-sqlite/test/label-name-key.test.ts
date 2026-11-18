import { ConflictError } from '@relay/engine';
import { AccountIdSchema, LabelIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase } from '../src';
import { insertLegacyAccount } from './support/legacy-account';
import { writeMigrationsBefore } from './support/partial-migrations';
import { seedAccount } from './support/seed';
import { createTempDirectory, createTestStore, type TempDirectory } from './support/test-database';

const labelId = (value: string) => LabelIdSchema.parse(value);

describe('case-insensitive label names in SQLite', () => {
  const directories: TempDirectory[] = [];

  afterEach(() => {
    directories.splice(0).forEach((directory) => {
      directory.remove();
    });
  });

  it('rejects a second label whose name differs only in case and finds labels by any case', async () => {
    const store = createTestStore();
    const { account } = await seedAccount(store.repositories);
    const { labels } = store.repositories;
    const label = {
      id: labelId('l-1'),
      accountId: account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword' as const,
      remoteName: 'Fakt&c3ba-ry',
    };
    await labels.upsert(label);

    await expect(
      labels.upsert({ ...label, id: labelId('l-2'), name: 'FAKTÚRY', remoteName: 'x' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await labels.findByName(account.id, 'faktúry'))?.id).toBe('l-1');
    await labels.upsert({ ...label, name: 'FAKTÚRY' });
    expect((await labels.findByName(account.id, 'Faktúry'))?.name).toBe('FAKTÚRY');
    store.database.close();
  });

  it('backfills keys and keeps existing names that collide ignoring case', async () => {
    const directory = createTempDirectory();
    directories.push(directory);
    const database = openDatabase(':memory:');
    migrate(database, {
      migrationsFolder: writeMigrationsBefore('0025_label_name_key', directory.path),
    });
    const account = insertLegacyAccount(database, { id: AccountIdSchema.parse('acc-old') });
    const insert = database.sqlite.prepare(
      `insert into labels (id, account_id, name, color, kind, remote_name) values (?, ?, ?, null, 'keyword', ?)`,
    );
    insert.run('l-a', account.id, 'Clients', 'Clients');
    insert.run('l-b', account.id, 'clients', 'clients-2');

    migrate(database);

    const keys = database.sqlite.prepare(`select id, name_key from labels order by id`).all() as {
      id: string;
      name_key: string;
    }[];
    expect(keys).toEqual([
      { id: 'l-a', name_key: 'clients' },
      { id: 'l-b', name_key: 'clients#l-b' },
    ]);
    const repositories = createSqliteRepositories(database);
    expect((await repositories.labels.findByName(account.id, 'CLIENTS'))?.id).toBe('l-a');
    database.close();
  });
});
