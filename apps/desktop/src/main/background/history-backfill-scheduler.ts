import type { Clock, HistorySliceReport, Logger } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { Timers } from '../platform/timers';
import type { BackgroundWorker } from './background-worker';
import { HistoryAccountLoop } from './history/history-account-loop';
import {
  DEFAULT_HISTORY_CADENCE,
  type HistoryCadence,
  type HistoryLoopState,
} from './history/history-cadence';
import { HistoryHolds } from './history/history-holds';

export interface HistoryBackfillSchedulerDeps {
  readonly listAccounts: () => Promise<readonly { readonly id: AccountId }[]>;
  readonly backfill: (accountId: AccountId) => Promise<HistorySliceReport>;
  readonly timers: Timers;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly cadence?: Partial<HistoryCadence>;
  readonly onState?: (accountId: AccountId, state: HistoryLoopState) => void;
}

export class HistoryBackfillScheduler implements BackgroundWorker {
  readonly name = 'history-backfill';
  private readonly loops = new Map<AccountId, HistoryAccountLoop>();
  private readonly draining = new Set<Promise<void>>();
  private readonly cadence: HistoryCadence;
  private readonly holds: HistoryHolds;
  private running = false;
  private generation = 0;
  private reconciling: Promise<void> = Promise.resolve();

  constructor(private readonly deps: HistoryBackfillSchedulerDeps) {
    this.cadence = { ...DEFAULT_HISTORY_CADENCE, ...deps.cadence };
    this.holds = new HistoryHolds(deps.clock);
  }

  async start(): Promise<void> {
    this.running = true;
    this.generation += 1;
    await this.reconcile();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.generation += 1;
    [...this.loops.keys()].forEach((accountId) => {
      this.release(accountId);
    });
    await this.idle();
  }

  reconcile(): Promise<void> {
    const next = this.reconciling.then(() => this.reconcileOnce());
    this.reconciling = next.catch(() => undefined);
    return next;
  }

  stateOf(accountId: AccountId): HistoryLoopState | null {
    return this.loops.get(accountId)?.state ?? null;
  }

  idle(): Promise<void> {
    return Promise.all([
      ...[...this.loops.values()].map((loop) => loop.idle()),
      ...this.draining,
    ]).then(() => undefined);
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
    [...this.loops.keys()]
      .filter((accountId) => !wanted.has(accountId))
      .forEach((accountId) => {
        this.release(accountId);
      });
    wanted.forEach((accountId) => {
      this.ensure(accountId);
    });
  }

  private ensure(accountId: AccountId): void {
    if (this.loops.has(accountId)) {
      return;
    }
    const loop = new HistoryAccountLoop({
      slice: () => this.deps.backfill(accountId),
      cadence: this.cadence,
      timers: this.deps.timers,
      logger: this.deps.logger.child({ accountId }),
      onState: (state) => this.deps.onState?.(accountId, state),
      hold: this.holds.of(accountId),
      onStep: (step, failures) => {
        this.holds.keep(accountId, step, failures);
      },
    });
    this.loops.set(accountId, loop);
    loop.start(this.holds.delayFor(accountId, this.cadence.startDelayMs));
  }

  private release(accountId: AccountId): void {
    const loop = this.loops.get(accountId);
    if (loop === undefined) {
      return;
    }
    loop.stop();
    this.loops.delete(accountId);
    const tracked = loop.idle().finally(() => {
      this.draining.delete(tracked);
    });
    this.draining.add(tracked);
  }
}
