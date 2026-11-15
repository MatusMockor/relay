import { Inject, Injectable } from '@nestjs/common';
import type { AccountId, UserId } from '@relay/shared/domain';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { QUEUES } from '../queue/queues';

@Injectable()
export class SyncTrigger {
  constructor(@Inject(JOB_QUEUE) private readonly queue: JobQueue) {}

  request(userId: UserId, accountId: AccountId): Promise<void> {
    return this.queue.send(QUEUES.syncAccount, { userId, accountId }, { singletonKey: accountId });
  }
}
