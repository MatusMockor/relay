import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { GoogleCalendarService, type Logger, PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { JOB_QUEUE, type JobQueue, type QueueDefinition } from '../jobs/queue/job-queue';

export const GOOGLE_CALENDAR_QUEUE: QueueDefinition = {
  name: 'due-google-calendars',
  policy: 'stately',
  retryLimit: 0,
  expireInSeconds: 900,
};

@Injectable()
export class GoogleCalendarScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(PORT_TOKENS.Logger) logger: Logger,
    private readonly google: GoogleCalendarService,
  ) {
    this.logger = logger.child({ component: 'GoogleCalendarScheduler' });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.jobs.enabled || this.config.google === null) {
      return;
    }
    await this.queue.register(GOOGLE_CALENDAR_QUEUE, () => this.syncDue());
    this.timer = setInterval(() => {
      void this.enqueue();
    }, this.config.jobs.tickMs);
    void this.enqueue();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async enqueue(): Promise<void> {
    await this.queue
      .send(GOOGLE_CALENDAR_QUEUE, {}, { singletonKey: 'due' })
      .catch((error: unknown) => {
        this.logger.error('Google calendar tick failed', { error });
      });
  }

  private async syncDue(): Promise<void> {
    await this.google.syncDue().catch((error: unknown) => {
      this.logger.error('Google calendar sync failed', { error });
    });
  }
}
