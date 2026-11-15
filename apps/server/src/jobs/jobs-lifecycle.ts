import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { JobTicker } from './job-ticker';
import { JobWorkers } from './job-workers';
import { JOB_QUEUE, type JobQueue } from './queue/job-queue';

interface StoppableQueue extends JobQueue {
  stop?(): Promise<void>;
}

@Injectable()
export class JobsLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(JOB_QUEUE) private readonly queue: StoppableQueue,
    private readonly workers: JobWorkers,
    private readonly ticker: JobTicker,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.jobs.enabled) {
      return;
    }
    await this.workers.register();
    this.ticker.start(this.config.jobs.tickMs);
  }

  async onModuleDestroy(): Promise<void> {
    await this.ticker.stop();
    await this.queue.stop?.();
  }
}
