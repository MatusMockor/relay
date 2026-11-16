import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { CalendarService, type Logger, PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { JOB_QUEUE, type JobQueue, type QueueDefinition } from '../jobs/queue/job-queue';

export const CALENDAR_FEEDS_QUEUE: QueueDefinition = {
  name: 'due-calendar-feeds',
  policy: 'stately',
  retryLimit: 0,
  expireInSeconds: 900,
};

@Injectable()
export class CalendarFeedScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(PORT_TOKENS.Logger) logger: Logger,
    private readonly calendar: CalendarService,
  ) {
    this.logger = logger.child({ component: 'CalendarFeedScheduler' });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.jobs.enabled) {
      return;
    }
    await this.queue.register(CALENDAR_FEEDS_QUEUE, () => this.refreshDue());
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
      .send(CALENDAR_FEEDS_QUEUE, {}, { singletonKey: 'due' })
      .catch((error: unknown) => {
        this.logger.error('Calendar feed tick failed', { error });
      });
  }

  private async refreshDue(): Promise<void> {
    await this.calendar.refreshDueSubscriptions().catch((error: unknown) => {
      this.logger.error('Calendar feed refresh failed', { error });
    });
  }
}
