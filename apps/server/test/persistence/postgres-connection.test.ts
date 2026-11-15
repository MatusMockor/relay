import { afterEach, describe, expect, it } from 'vitest';
import { openPostgresConnection } from '../../src/persistence/database/postgres-connection';
import { createTestDatabase, type TestDatabase } from './support/test-database';

describe('openPostgresConnection', () => {
  let database: TestDatabase | null = null;

  afterEach(async () => {
    await database?.drop();
    database = null;
  });

  it('survives Postgres terminating an idle pooled client', async () => {
    database = await createTestDatabase({ migrate: false });
    const errors: Error[] = [];
    const connection = openPostgresConnection({
      url: database.url,
      maxConnections: 2,
      onIdleClientError: (error) => errors.push(error),
    });
    const client = await connection.pool.connect();
    const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
    client.release();

    const admin = openPostgresConnection({ url: database.url, maxConnections: 1 });
    await admin.pool.query('select pg_terminate_backend($1)', [rows[0]?.pid]);
    await admin.close();
    await expect.poll(() => errors.length).toBe(1);

    const { rows: alive } = await connection.pool.query<{ one: number }>('select 1 as one');
    expect(alive[0]?.one).toBe(1);
    await connection.close();
  });
});
