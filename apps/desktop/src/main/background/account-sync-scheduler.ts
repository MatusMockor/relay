import type { Logger } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { Timers } from '../platform/timers';
import type { BackgroundWorker } from './background-worker';
import { PeriodicRunner } from './periodic-runner';

export interface SyncableAccount {
  readonly id: AccountId;
  readonly syncIntervalSeconds: number;
}

export interface AccountSyncSchedulerDeps {
  readonly listAccounts: () => Promise<readonly SyncableAccount[]>;
  readonly syncAccount: (accountId: AccountId) => Promise<void>;
  readonly timers: Timers;
  readonly logger: Logger;
}

export class AccountSyncScheduler implements BackgroundWorker {
  readonly name = 'account-sync';
  private readonly runners = new Map<AccountId, PeriodicRunner>();
  private running = false;
  private generation = 0;
  private reconciling: Promise<void> = Promise.resolve();

  constructor(private readonly deps: AccountSyncSchedulerDeps) {}

  async start(): Promise<void> {
    this.running = true;
    this.generation += 1;
    await this.reconcile();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.generation += 1;
    const runners = [...this.runners.values()];
    this.runners.clear();
    runners.forEach((runner) => {
      runner.stop();
    });
    await Promise.all(runners.map((runner) => runner.idle()));
  }

  reconcile(): Promise<void> {
    const next = this.reconciling.then(() => this.reconcileOnce());
    this.reconciling = next.catch(() => undefined);
    return next;
  }

  private async reconcileOnce(): Promise<void> {
    if (!this.running) {
      return;
    }
    const generation = this.generation;
    const accounts = await this.deps.listAccounts();
    if (generation !== this.generation) {
      return;
    }
    const wanted = new Set(accounts.map((account) => account.id));
    this.runners.forEach((runner, accountId) => {
      if (wanted.has(accountId)) {
        return;
      }
      runner.stop();
      this.runners.delete(accountId);
    });
    accounts.forEach((account) => {
      this.ensureRunner(account);
    });
  }

  async syncNow(accountId?: AccountId): Promise<void> {
    if (accountId !== undefined) {
      await this.runnerFor(accountId).trigger();
      return;
    }
    await Promise.all([...this.runners.values()].map((runner) => runner.trigger()));
  }

  idle(): Promise<void> {
    return Promise.all([...this.runners.values()].map((runner) => runner.idle())).then(
      () => undefined,
    );
  }

  private ensureRunner(account: SyncableAccount): void {
    const intervalMs = account.syncIntervalSeconds * 1_000;
    const existing = this.runners.get(account.id);
    if (existing !== undefined) {
      existing.setInterval(intervalMs);
      return;
    }
    const runner = this.createRunner(account.id, intervalMs);
    this.runners.set(account.id, runner);
    runner.start(0);
  }

  private runnerFor(accountId: AccountId): PeriodicRunner {
    const existing = this.runners.get(accountId);
    if (existing !== undefined) {
      return existing;
    }
    return this.createRunner(accountId, 0);
  }

  private createRunner(accountId: AccountId, intervalMs: number): PeriodicRunner {
    const logger = this.deps.logger.child({ accountId });
    return new PeriodicRunner(
      () => this.deps.syncAccount(accountId),
      intervalMs,
      this.deps.timers,
      (error) => {
        logger.warn('Account sync failed', { error });
      },
    );
  }
}
