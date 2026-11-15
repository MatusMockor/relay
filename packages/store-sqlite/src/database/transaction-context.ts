import { AsyncLocalStorage } from 'node:async_hooks';
import type { Repositories } from '@relay/engine';

export interface ActiveTransaction {
  readonly repositories: Repositories;
  isOpen(): boolean;
}

export class TransactionContext {
  private readonly storage = new AsyncLocalStorage<ActiveTransaction>();

  current(): ActiveTransaction | null {
    const active = this.storage.getStore();
    if (active === undefined || !active.isOpen()) {
      return null;
    }
    return active;
  }

  runWithin<Result>(transaction: ActiveTransaction, work: () => Promise<Result>): Promise<Result> {
    return this.storage.run(transaction, work);
  }
}
