import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DbExecutor } from './database';

export interface PostgresConnection {
  readonly pool: pg.Pool;
  readonly db: DbExecutor;
  close(): Promise<void>;
}

export interface PostgresConnectionOptions {
  readonly url: string;
  readonly maxConnections?: number;
}

export const openPostgresConnection = (options: PostgresConnectionOptions): PostgresConnection => {
  const pool = new pg.Pool({ connectionString: options.url, max: options.maxConnections ?? 10 });
  return {
    pool,
    db: drizzle({ client: pool }),
    close: () => pool.end(),
  };
};
