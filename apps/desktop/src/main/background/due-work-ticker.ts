import type { Logger } from '@relay/engine';
import type { Timers } from '../platform/timers';
import type { BackgroundWorker } from './background-worker';
import { PeriodicRunner } from './periodic-runner';

export interface DueJob {
  readonly name: string;
  run(): Promise<void>;
}

export interface DueWorkTickerDeps {
  readonly jobs: readonly DueJob[];
  readonly intervalMs: number;
  readonly timers: Timers;
  readonly logger: Logger;
}

export class DueWorkTicker implements BackgroundWorker {
  readonly name = 'due-work';
  private readonly runner: PeriodicRunner;

  constructor(private readonly deps: DueWorkTickerDeps) {
    this.runner = new PeriodicRunner(
      () => this.runAll(),
      deps.intervalMs,
      deps.timers,
      (error) => {
        deps.logger.error('Due work tick failed', { error });
      },
    );
  }

  start(): Promise<void> {
    this.runner.start(0);
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    this.runner.stop();
    await this.runner.idle();
  }

  tick(): Promise<void> {
    return this.runner.trigger();
  }

  private async runAll(): Promise<void> {
    for (const job of this.deps.jobs) {
      await job.run().catch((error: unknown) => {
        this.deps.logger.warn('Due job failed', { job: job.name, error });
      });
    }
  }
}
