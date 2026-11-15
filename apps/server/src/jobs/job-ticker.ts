import { Inject, Injectable } from '@nestjs/common';
import { type Logger, PORT_TOKENS } from '@relay/engine';
import { JOB_QUEUE, type JobQueue } from './queue/job-queue';
import { QUEUES } from './queue/queues';
import { SyncScheduler } from './sync/sync-scheduler';

@Injectable()
export class JobTicker {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private readonly logger: Logger;

  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(PORT_TOKENS.Logger) logger: Logger,
    private readonly scheduler: SyncScheduler,
  ) {
    this.logger = logger.child({ component: 'JobTicker' });
  }

  start(intervalMs: number): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.running;
  }

  tick(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    try {
      await this.scheduler.tick();
      await this.queue.send(QUEUES.dueReminders, {}, { singletonKey: 'due' });
      await this.queue.send(QUEUES.dueScheduledSends, {}, { singletonKey: 'due' });
      await this.queue.send(QUEUES.dueAiJobs, {}, { singletonKey: 'due' });
    } catch (error) {
      this.logger.error('Job tick failed', { error });
    }
  }
}
