import type { Repositories } from './repositories';

export interface UnitOfWork {
  run<Result>(work: (repositories: Repositories) => Promise<Result>): Promise<Result>;
}
