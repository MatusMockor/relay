import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SerialQueue } from './serial-queue';
import type { TransactionContext } from './transaction-context';

export type RelayDb = BetterSQLite3Database;

export interface SqliteDatabase {
  readonly sqlite: Database.Database;
  readonly db: RelayDb;
  readonly queue: SerialQueue;
  readonly transactions: TransactionContext;
  close(): void;
}
