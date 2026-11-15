import type { UnitOfWork } from '@relay/engine';
import type { ServerRepositories, ServerUnitOfWork } from '../../core/ports/server-unit-of-work';
import type { DbExecutor } from '../database/database';
import { createPgRepositories } from '../repositories/create-pg-repositories';

export class PgUnitOfWork implements UnitOfWork, ServerUnitOfWork {
  constructor(private readonly db: DbExecutor) {}

  run<Result>(work: (repositories: ServerRepositories) => Promise<Result>): Promise<Result> {
    return this.db.transaction((tx) => work(createPgRepositories(tx)));
  }
}
