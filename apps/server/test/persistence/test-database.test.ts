import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testInfra } from '@relay/config/test-infra';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from './support/test-database';

const brokenMigrationsFolder = async (): Promise<string> => {
  const folder = await mkdtemp(join(tmpdir(), 'relay-broken-migrations-'));
  await mkdir(join(folder, 'meta'));
  await writeFile(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [{ idx: 0, version: '7', when: 1, tag: '0000_broken', breakpoints: true }],
    }),
  );
  await writeFile(join(folder, '0000_broken.sql'), 'SELECT * FROM missing_table;');
  return folder;
};

const databaseExists = async (name: string): Promise<boolean> => {
  const client = new pg.Client({ connectionString: testInfra.postgres.url });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return rows.length > 0;
  } finally {
    await client.end();
  }
};

describe('createTestDatabase', () => {
  it('drops the database and rethrows when migrations fail', async () => {
    const folder = await brokenMigrationsFolder();
    const name = `relay_test_${randomBytes(6).toString('hex')}`;

    await expect(createTestDatabase({ name, migrationsFolder: folder })).rejects.toThrow(
      /missing_table/,
    );
    await rm(folder, { recursive: true, force: true });

    await expect(databaseExists(name)).resolves.toBe(false);
  });
});
