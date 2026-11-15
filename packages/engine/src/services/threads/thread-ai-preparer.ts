import type {
  AiJob,
  Message,
  ThreadAiJobRef,
  ThreadAiKind,
  ThreadAiState,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { CreateAiJobBody } from '@relay/shared/api';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { AiJobEnqueueResult } from '../../ports/ai-job-repository';
import type { AiResultRepository } from '../../ports/ai-result-repository';
import type { Logger } from '../../ports/logger';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import { latestThreadMessage } from '../shared/latest-thread-message';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { UserSettingsReader } from '../shared/user-settings-reader';
import { threadAiKinds } from './thread-ai-kinds';

export interface AiJobEnqueuer {
  enqueueJob(userId: UserId, body: CreateAiJobBody): Promise<AiJobEnqueueResult>;
}

export interface ThreadAiPreparerDeps {
  readonly threads: ThreadRepository;
  readonly messages: MessageRepository;
  readonly accounts: AccountRepository;
  readonly aiResults: AiResultRepository;
  readonly creator: AiJobEnqueuer;
  readonly settings: UserSettingsReader;
  readonly logger: Logger;
}

export class ThreadAiPreparer {
  constructor(private readonly deps: ThreadAiPreparerDeps) {}

  async prepare(userId: UserId, threadId: ThreadId): Promise<ThreadAiState> {
    const thread = await this.deps.threads.findById(userId, threadId);
    if (thread === null) {
      throw new NotFoundError('Thread', threadId);
    }
    const latest = await latestThreadMessage(this.deps.messages, userId, threadId);
    if (latest === null) {
      return { pending: [], jobs: [] };
    }
    const kinds = threadAiKinds({
      settings: await this.deps.settings.read(userId),
      thread,
      account: await this.deps.accounts.findById(userId, thread.accountId),
      latest,
    });
    const jobs: ThreadAiJobRef[] = [];
    for (const kind of kinds) {
      const job = await this.ensure(userId, threadId, kind, latest);
      if (job !== null) {
        jobs.push({ kind, jobId: job.id });
      }
    }
    return { pending: jobs.map((job) => job.kind), jobs };
  }

  private async ensure(
    userId: UserId,
    threadId: ThreadId,
    kind: ThreadAiKind,
    latest: Message,
  ): Promise<AiJob | null> {
    try {
      const result = await this.deps.aiResults.findLatest(userId, threadId, kind);
      if (result?.sourceMessageId === latest.id) {
        return null;
      }
      return (await this.deps.creator.enqueueJob(userId, { input: { kind, threadId } })).job;
    } catch (error) {
      this.deps.logger.warn('Could not prepare thread AI', {
        threadId,
        kind,
        error: errorMessage(error),
      });
      return null;
    }
  }
}
