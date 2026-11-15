import pg from 'pg';
import { expect } from 'vitest';

export interface LockHolder {
  query(text: string, values?: unknown[]): Promise<pg.QueryResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

const finish = async (client: pg.Client, command: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
  try {
    await client.query(command);
  } finally {
    await client.end();
  }
};

export const openLockHolder = async (url: string): Promise<LockHolder> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('BEGIN');
  return {
    query: (text, values) => client.query(text, values),
    commit: () => finish(client, 'COMMIT'),
    rollback: () => finish(client, 'ROLLBACK'),
  };
};

const countLockWaiters = async (url: string): Promise<number> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    return rows[0]?.waiting ?? 0;
  } finally {
    await client.end();
  }
};

export const waitForLockWaiters = async (url: string, expected = 1): Promise<void> => {
  await expect
    .poll(() => countLockWaiters(url), { timeout: 5_000, interval: 20 })
    .toBeGreaterThanOrEqual(expected);
};
