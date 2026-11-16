import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AttachmentSweeper, type Logger, PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { JOB_QUEUE, type JobQueue, type QueueDefinition } from '../jobs/queue/job-queue';

export const ATTACHMENT_SWEEP_QUEUE: QueueDefinition = {
  name: 'sweep-attachments',
  policy: 'stately',
  retryLimit: 0,
  expireInSeconds: 1800,
};

@Injectable()
export class AttachmentSweepScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(PORT_TOKENS.Logger) logger: Logger,
    private readonly sweeper: AttachmentSweeper,
  ) {
    this.logger = logger.child({ component: 'AttachmentSweepScheduler' });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.jobs.enabled) {
      return;
    }
    await this.queue.register(ATTACHMENT_SWEEP_QUEUE, () => this.sweep());
    this.timer = setInterval(() => {
      void this.enqueue();
    }, this.config.attachments.sweepIntervalSeconds * 1000);
    void this.enqueue();
  }

  onModuleDestroy(): void {
    if (this.timer === null) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  enqueue(): Promise<void> {
    return this.queue
      .send(ATTACHMENT_SWEEP_QUEUE, {}, { singletonKey: 'sweep' })
      .catch((error: unknown) => {
        this.logger.error('Scheduling the attachment sweep failed', { error });
      });
  }

  private async sweep(): Promise<void> {
    await this.sweeper.sweep().catch((error: unknown) => {
      this.logger.error('Attachment sweep failed', { error });
    });
  }
}
