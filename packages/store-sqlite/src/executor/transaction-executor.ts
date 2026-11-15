import type { SqliteDatabase } from '../database/sqlite-database';
import { runAtomicallyNow } from './run-atomically';
import type { SqliteExecutor, SqliteOperation } from './sqlite-executor';

export class TransactionExecutor implements SqliteExecutor {
  private open = true;

  constructor(private readonly database: SqliteDatabase) {}

  isOpen(): boolean {
    return this.open;
  }

  close(): void {
    this.open = false;
  }

  execute<Result>(operation: SqliteOperation<Result>): Promise<Result> {
    if (!this.open) {
      return Promise.reject(new Error('The unit of work has already finished'));
    }
    return runAtomicallyNow(this.database, operation);
  }
}
