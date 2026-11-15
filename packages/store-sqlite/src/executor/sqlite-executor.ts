import type { RelayDb } from '../database/sqlite-database';

export type SqliteOperation<Result> = (db: RelayDb) => Result;

export interface SqliteExecutor {
  execute<Result>(operation: SqliteOperation<Result>): Promise<Result>;
}
