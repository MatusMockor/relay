import type { Logger } from '@relay/engine';
import type { PowerEvents } from '../platform/power-events';
import type { BackgroundWorker } from './background-worker';

export class PowerAwareLifecycle {
  private unsubscribe: (() => void)[] = [];
  private transition: Promise<void> = Promise.resolve();
  private started = false;

  constructor(
    private readonly workers: readonly BackgroundWorker[],
    private readonly power: PowerEvents,
    private readonly logger: Logger,
  ) {}

  get isRunning(): boolean {
    return this.started;
  }

  start(): Promise<void> {
    if (this.unsubscribe.length === 0) {
      this.unsubscribe = [
        this.power.onSuspend(() => void this.pause()),
        this.power.onResume(() => void this.resume()),
      ];
    }
    return this.resume();
  }

  async shutdown(): Promise<void> {
    this.unsubscribe.forEach((dispose) => {
      dispose();
    });
    this.unsubscribe = [];
    await this.pause();
  }

  pause(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.started) {
        return;
      }
      this.started = false;
      this.logger.info('Pausing background work');
      await Promise.all(this.workers.map((worker) => this.safely(worker, 'stop')));
    });
  }

  resume(): Promise<void> {
    return this.enqueue(async () => {
      if (this.started) {
        return;
      }
      this.started = true;
      this.logger.info('Starting background work');
      await Promise.all(this.workers.map((worker) => this.safely(worker, 'start')));
    });
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    this.transition = this.transition.then(step);
    return this.transition;
  }

  private async safely(worker: BackgroundWorker, action: 'start' | 'stop'): Promise<void> {
    try {
      await worker[action]();
    } catch (error) {
      this.logger.error(`Background worker failed to ${action}`, { worker: worker.name, error });
    }
  }
}
