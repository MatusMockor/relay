import { ConflictError } from '@relay/engine';
import { AccountIdSchema, LabelIdSchema } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteRepositories, migrate, openDatabase, type SqliteDatabase } from '../src';
import { repairLabelNameKeys } from '../src/database/repair-label-name-keys';
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

  const legacyDatabase = (names: readonly (readonly [string, string])[]) => {
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
    names.forEach(([id, name]) => insert.run(id, account.id, name, `${name}-${id}`));
    migrate(database);
    return { database, account };
  };

  const keysOf = (database: SqliteDatabase) =>
    database.sqlite.prepare(`select id, name_key from labels order by id`).all() as {
      id: string;
      name_key: string;
    }[];

  it('backfills keys with runtime normalization and a collision-proof suffix', async () => {
    const { database, account } = legacyDatabase([
      ['l-a', 'Clients'],
      ['l-b', 'clients'],
      ['l-c', 'clients#l-b'],
      ['l-d', 'Účty'],
      ['l-e', 'U\u0301ČTY'],
    ]);

    expect(keysOf(database)).toEqual([
      { id: 'l-a', name_key: 'clients' },
      { id: 'l-b', name_key: 'clients\u0001l-b' },
      { id: 'l-c', name_key: 'clients#l-b' },
      { id: 'l-d', name_key: 'účty' },
      { id: 'l-e', name_key: 'účty\u0001l-e' },
    ]);
    expect(repairLabelNameKeys(database)).toBe(0);
    const { labels } = createSqliteRepositories(database);
    expect((await labels.findByName(account.id, 'CLIENTS'))?.id).toBe('l-a');
    expect((await labels.findByName(account.id, 'ÚČTY'))?.id).toBe('l-d');
    database.close();
  });

  it('keeps the stored key when a colliding legacy label changes only its colour', async () => {
    const { database, account } = legacyDatabase([
      ['l-a', 'Clients'],
      ['l-b', 'clients'],
    ]);
    const { labels } = createSqliteRepositories(database);
    const legacy = {
      id: labelId('l-b'),
      accountId: account.id,
      name: 'clients',
      kind: 'keyword' as const,
      remoteName: 'clients-l-b',
    };

    await labels.upsert({ ...legacy, color: '#ff0000' });
    await expect(labels.upsert({ ...legacy, name: 'CLIENTS', color: null })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await labels.upsert({ ...legacy, name: 'Zákazníci', color: null });

    expect(keysOf(database)).toEqual([
      { id: 'l-a', name_key: 'clients' },
      { id: 'l-b', name_key: 'zákazníci' },
    ]);
    database.close();
  });
});
