import type { SqliteDatabase } from '../database/sqlite-database';
import { runAtomicallyNow } from './run-atomically';
import type { SqliteOperation } from './sqlite-executor';

export const runInOpenTransaction = <Result>(
  database: SqliteDatabase,
  operation: SqliteOperation<Result>,
): Promise<Result> => {
  if (!database.sqlite.inTransaction) {
    return Promise.reject(new Error('The unit of work transaction was rolled back'));
  }
  return runAtomicallyNow(database, operation);
};
