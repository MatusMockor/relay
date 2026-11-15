import { Inject, Injectable } from '@nestjs/common';
import { AiService } from '@relay/engine';
import type { CreateAiJobBody } from '@relay/shared/api';
import type { AiJob, UserId } from '@relay/shared/domain';
import { JOB_QUEUE, type JobQueue } from '../jobs/queue/job-queue';
import { QUEUES } from '../jobs/queue/queues';

@Injectable()
export class AiJobDispatcher {
  constructor(
    private readonly ai: AiService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async create(userId: UserId, body: CreateAiJobBody): Promise<AiJob> {
    const job = await this.ai.createJob(userId, body);
    if (job.runnerLocation === this.ai.runnerLocation && job.status === 'queued') {
      await this.queue.send(QUEUES.aiJob, { userId, jobId: job.id });
    }
    return job;
  }
}
