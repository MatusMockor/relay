import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { SerialQueue } from './serial-queue';
import type { SqliteDatabase } from './sqlite-database';
import { TransactionContext } from './transaction-context';

export interface OpenDatabaseOptions {
  readonly readonly?: boolean;
  readonly busyTimeoutMs?: number;
}

const IN_MEMORY = ':memory:';
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export const openDatabase = (path: string, options: OpenDatabaseOptions = {}): SqliteDatabase => {
  const readonly = options.readonly ?? false;
  const sqlite = new Database(path, { readonly });
  sqlite.pragma(`busy_timeout = ${String(options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS)}`);
  sqlite.pragma('foreign_keys = ON');
  if (path !== IN_MEMORY && !readonly) {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
  }
  return {
    sqlite,
    db: drizzle({ client: sqlite }),
    queue: new SerialQueue(),
    transactions: new TransactionContext(),
    close: () => {
      sqlite.close();
    },
  };
};
