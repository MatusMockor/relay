import type { MailAccount, Message, ThreadId, UserId } from '@relay/shared/domain';
import type { AiResultRepository } from '../../ports/ai-result-repository';
import type { Logger } from '../../ports/logger';
import type { ThreadRepository } from '../../ports/thread-repository';
import { toTimestamp } from '../shared/dates';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import type { InboxArrival, SyncArrivalBatch, SyncArrivalListener } from '../sync/sync-arrivals';
import type { AiJobFactory } from './ai-job-factory';
import { isPersonalInbound } from './inbound-mail-filter';

export interface OneLinerSchedulerDeps {
  readonly settings: UserSettingsReader;
  readonly threads: ThreadRepository;
  readonly aiResults: AiResultRepository;
  readonly factory: AiJobFactory;
  readonly logger: Logger;
  readonly limitPerSync: number;
}

export class OneLinerScheduler implements SyncArrivalListener {
  constructor(private readonly deps: OneLinerSchedulerDeps) {}

  async onArrivals({ userId, account, startedAt, arrivals }: SyncArrivalBatch): Promise<void> {
    if (arrivals.length === 0 || this.deps.limitPerSync <= 0) {
      return;
    }
    const settings = await this.deps.settings.read(userId);
    if (!settings.ai.features.oneLiners) {
      return;
    }
    let queued = 0;
    for (const arrival of newestPerThread(account, arrivals)) {
      if (queued >= this.deps.limitPerSync) {
        return;
      }
      if (await this.enqueue(userId, arrival, startedAt)) {
        queued += 1;
      }
    }
  }

  private async enqueue(userId: UserId, arrival: Message, since: string): Promise<boolean> {
    try {
      if (!(await this.needsOneLiner(userId, arrival, since))) {
        return false;
      }
      const result = await this.deps.factory.enqueue(userId, {
        input: { kind: 'oneLiner', threadId: arrival.threadId, sourceMessageId: arrival.id },
      });
      return result.created;
    } catch (error) {
      this.deps.logger.warn('Could not queue an AI one-liner', {
        threadId: arrival.threadId,
        error: errorMessage(error),
      });
      return false;
    }
  }

  private async needsOneLiner(userId: UserId, arrival: Message, since: string): Promise<boolean> {
    const thread = await this.deps.threads.findById(userId, arrival.threadId);
    if (thread?.state !== 'inbox') {
      return false;
    }
    const result = await this.deps.aiResults.findLatest(userId, arrival.threadId, 'oneLiner');
    return (
      result?.sourceMessageId !== arrival.id || toTimestamp(result.createdAt) < toTimestamp(since)
    );
  }
}

const newestPerThread = (account: MailAccount, arrivals: readonly InboxArrival[]): Message[] => {
  const newest = new Map<ThreadId, Message>();
  arrivals
    .filter((arrival) => isPersonalInbound(account, arrival))
    .map((arrival) => arrival.message)
    .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date))
    .forEach((message) => {
      if (!newest.has(message.threadId)) {
        newest.set(message.threadId, message);
      }
    });
  return [...newest.values()];
};
