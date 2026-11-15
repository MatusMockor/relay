import type { SqliteDatabase } from '../database/sqlite-database';
import { runAtomically, runAtomicallyNow } from './run-atomically';
import type { SqliteExecutor, SqliteOperation } from './sqlite-executor';

export class QueuedExecutor implements SqliteExecutor {
  constructor(private readonly database: SqliteDatabase) {}

  execute<Result>(operation: SqliteOperation<Result>): Promise<Result> {
    if (this.database.transactions.current() !== null) {
      return runAtomicallyNow(this.database, operation);
    }
    return this.database.queue.enqueue(() => runAtomically(this.database, operation));
  }
}
