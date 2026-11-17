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
import {
  openedThreadAiKinds,
  requestedSummaryKinds,
  type ThreadAiKindPicker,
} from './thread-ai-kinds';

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

interface ThreadAiInput {
  readonly kind: ThreadAiKind;
  readonly threadId: ThreadId;
  readonly timeZone: string | undefined;
}

const withZone = ({ kind, threadId, timeZone }: ThreadAiInput) =>
  timeZone === undefined ? { kind, threadId } : { kind, threadId, timeZone };

export class ThreadAiPreparer {
  constructor(private readonly deps: ThreadAiPreparerDeps) {}

  prepare(userId: UserId, threadId: ThreadId, timeZone?: string): Promise<ThreadAiState> {
    return this.ensureKinds(userId, { threadId, timeZone }, openedThreadAiKinds);
  }

  requestSummary(userId: UserId, threadId: ThreadId, timeZone?: string): Promise<ThreadAiState> {
    return this.ensureKinds(userId, { threadId, timeZone }, requestedSummaryKinds);
  }

  private async ensureKinds(
    userId: UserId,
    { threadId, timeZone }: Omit<ThreadAiInput, 'kind'>,
    pick: ThreadAiKindPicker,
  ): Promise<ThreadAiState> {
    const thread = await this.deps.threads.findById(userId, threadId);
    if (thread === null) {
      throw new NotFoundError('Thread', threadId);
    }
    const latest = await latestThreadMessage(this.deps.messages, userId, threadId);
    if (latest === null) {
      return { pending: [], jobs: [] };
    }
    const kinds = pick({
      settings: await this.deps.settings.read(userId),
      thread,
      account: await this.deps.accounts.findById(userId, thread.accountId),
      latest,
    });
    const jobs: ThreadAiJobRef[] = [];
    for (const kind of kinds) {
      const job = await this.ensure(userId, { kind, threadId, timeZone }, latest);
      if (job !== null) {
        jobs.push({ kind, jobId: job.id });
      }
    }
    return { pending: jobs.map((job) => job.kind), jobs };
  }

  private async ensure(
    userId: UserId,
    input: ThreadAiInput,
    latest: Message,
  ): Promise<AiJob | null> {
    const { kind, threadId } = input;
    try {
      const result = await this.deps.aiResults.findLatest(userId, threadId, kind);
      if (result?.sourceMessageId === latest.id) {
        return null;
      }
      return (await this.deps.creator.enqueueJob(userId, { input: withZone(input) })).job;
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
