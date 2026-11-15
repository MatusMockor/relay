import type { AccountId } from '@relay/shared/domain';
import type { BackgroundWorker } from './background-worker';
import type { IdleSupervisor } from './idle-supervisor';

export class IdleWorker implements BackgroundWorker {
  readonly name = 'imap-idle';
  private running = false;
  private generation = 0;
  private reconciling: Promise<void> = Promise.resolve();

  constructor(
    private readonly supervisor: IdleSupervisor,
    private readonly listWatchable: () => Promise<readonly AccountId[]>,
  ) {}

  async start(): Promise<void> {
    this.running = true;
    this.generation += 1;
    await this.reconcile();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.generation += 1;
    await this.enqueue(() => this.supervisor.stopAll());
  }

  reconcile(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.running) {
        return;
      }
      const generation = this.generation;
      const accountIds = await this.listWatchable();
      if (generation !== this.generation) {
        return;
      }
      await this.supervisor.reconcile(accountIds);
    });
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    const next = this.reconciling.then(step);
    this.reconciling = next.catch(() => undefined);
    return next;
  }
}
