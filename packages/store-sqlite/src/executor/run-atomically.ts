import type { SqliteDatabase } from '../database/sqlite-database';
import type { SqliteOperation } from './sqlite-executor';
import { translateSqliteError } from './translate-sqlite-error';

export const runAtomically = <Result>(
  database: SqliteDatabase,
  operation: SqliteOperation<Result>,
): Result => {
  try {
    return database.sqlite.transaction(() => operation(database.db))();
  } catch (error) {
    throw translateSqliteError(error);
  }
};

export const runAtomicallyNow = <Result>(
  database: SqliteDatabase,
  operation: SqliteOperation<Result>,
): Promise<Result> =>
  new Promise((resolve) => {
    resolve(runAtomically(database, operation));
  });
