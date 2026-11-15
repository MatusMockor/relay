import type { Repositories, UnitOfWork } from '@relay/engine';
import { createRepositoriesWith } from './create-sqlite-repositories';
import type { SqliteDatabase } from './database/sqlite-database';
import { TransactionExecutor } from './executor/transaction-executor';
import { translateSqliteError } from './executor/translate-sqlite-error';

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly database: SqliteDatabase) {}

  run<Result>(work: (repositories: Repositories) => Promise<Result>): Promise<Result> {
    const active = this.database.transactions.current();
    if (active !== null) {
      return work(active.repositories);
    }
    return this.database.queue.enqueue(() => this.runInTransaction(work));
  }

  private async runInTransaction<Result>(
    work: (repositories: Repositories) => Promise<Result>,
  ): Promise<Result> {
    const { sqlite, transactions } = this.database;
    const executor = new TransactionExecutor(this.database);
    const repositories = createRepositoriesWith(executor);
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = await transactions.runWithin(
        { repositories, isOpen: () => executor.isOpen() },
        () => work(repositories),
      );
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      if (sqlite.inTransaction) {
        sqlite.exec('ROLLBACK');
      }
      throw translateSqliteError(error);
    } finally {
      executor.close();
    }
  }
}
