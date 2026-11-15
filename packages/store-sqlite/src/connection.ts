import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';

export interface SqliteConnectionOptions {
  readonly filename: string;
  readonly readonly?: boolean;
  readonly busyTimeoutMs?: number;
}

export interface SqliteConnection {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database;
  close(): void;
}

const IN_MEMORY = ':memory:';

export const openSqliteConnection = (options: SqliteConnectionOptions): SqliteConnection => {
  const sqlite = new Database(options.filename, { readonly: options.readonly ?? false });
  sqlite.pragma(`busy_timeout = ${String(options.busyTimeoutMs ?? 5_000)}`);
  sqlite.pragma('foreign_keys = ON');
  if (options.filename !== IN_MEMORY && options.readonly !== true) {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
  }
  return {
    sqlite,
    db: drizzle({ client: sqlite }),
    close: () => {
      sqlite.close();
    },
  };
};
