import { Inject, Injectable } from '@nestjs/common';
import {
  AiService,
  ComposeService,
  ConflictError,
  type Logger,
  PORT_TOKENS,
  ReminderService,
  SyncService,
} from '@relay/engine';
import { JOB_QUEUE, type JobQueue } from './queue/job-queue';
import { QUEUES } from './queue/queues';
import { AiJobJobSchema } from './ai/ai-job.job';
import { SyncAccountJobSchema } from './sync/sync-account.job';

@Injectable()
export class JobWorkers {
  private readonly logger: Logger;

  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(PORT_TOKENS.Logger) logger: Logger,
    private readonly sync: SyncService,
    private readonly reminders: ReminderService,
    private readonly compose: ComposeService,
    private readonly ai: AiService,
  ) {
    this.logger = logger.child({ component: 'JobWorkers' });
  }

  async register(): Promise<void> {
    await this.queue.register(QUEUES.syncAccount, (data) => this.syncAccount(data));
    await this.queue.register(QUEUES.dueReminders, () => this.fireReminders());
    await this.queue.register(QUEUES.dueScheduledSends, () => this.sendScheduled());
    await this.queue.register(QUEUES.aiJob, (data) => this.runAiJob(data));
    await this.queue.register(QUEUES.dueAiJobs, () => this.runQueuedAiJobs());
  }

  private async syncAccount(data: unknown): Promise<void> {
    const job = SyncAccountJobSchema.safeParse(data);
    if (!job.success) {
      this.logger.warn('Dropping invalid sync job', { data });
      return;
    }
    await this.guard('sync', () => this.sync.syncAccount(job.data.userId, job.data.accountId));
  }

  private async fireReminders(): Promise<void> {
    await this.guard('reminders', () => this.reminders.fireDue());
  }

  private async sendScheduled(): Promise<void> {
    await this.guard('scheduled-sends', () => this.compose.sendDueScheduled());
  }

  private async runAiJob(data: unknown): Promise<void> {
    const job = AiJobJobSchema.safeParse(data);
    if (!job.success) {
      this.logger.warn('Dropping invalid AI job', { data });
      return;
    }
    await this.guard('ai', () =>
      this.ai.runJob(job.data.userId, job.data.jobId).catch((error: unknown) => {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
        this.logger.debug('AI job already claimed by another worker', { jobId: job.data.jobId });
      }),
    );
  }

  private async runQueuedAiJobs(): Promise<void> {
    await this.guard('ai-queue', () => this.ai.processQueued());
  }

  private async guard(name: string, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error('Job failed', { job: name, error });
    }
  }
}
