import { randomBytes } from 'node:crypto';
import { testInfra } from '@relay/config/test-infra';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { startTestApp } from './support/test-app';

const databaseExists = async (name: string): Promise<boolean> => {
  const client = new pg.Client({ connectionString: testInfra.postgres.url });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    return result.rows.length > 0;
  } finally {
    await client.end();
  }
};

describe('startTestApp', () => {
  it('drops its database when the app fails to start', async () => {
    const databaseName = `relay_test_${randomBytes(6).toString('hex')}`;

    await expect(startTestApp({ databaseName, env: { DATABASE_POOL_MAX: '0' } })).rejects.toThrow(
      /DATABASE_POOL_MAX/,
    );

    expect(await databaseExists(databaseName)).toBe(false);
  });
});
