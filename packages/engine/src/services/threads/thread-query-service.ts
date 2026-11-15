import type {
  AiOutputOf,
  ThreadDetail,
  ThreadId,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AiResultRepository } from '../../ports/ai-result-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import { byDateAscending } from '../shared/dates';

export interface ThreadReadMarker {
  markRead(userId: UserId, threadId: ThreadId): Promise<ThreadSummary>;
}

export interface ThreadQueryServiceDeps {
  readonly threads: ThreadRepository;
  readonly messages: MessageRepository;
  readonly aiResults: AiResultRepository;
  readonly readMarker: ThreadReadMarker | null;
}

export interface ThreadDetailOptions {
  readonly markRead?: boolean;
}

export class ThreadQueryService {
  constructor(private readonly deps: ThreadQueryServiceDeps) {}

  async getDetail(
    userId: UserId,
    threadId: ThreadId,
    options: ThreadDetailOptions = {},
  ): Promise<ThreadDetail> {
    const thread = await this.loadThread(userId, threadId, options);
    const messages = await this.deps.messages.listByThread(userId, threadId);
    const summary = await this.latest<'summary'>(userId, threadId, 'summary');
    const replies = await this.latest<'replySuggestions'>(userId, threadId, 'replySuggestions');
    return {
      thread,
      messages: [...messages].sort(byDateAscending),
      aiSummary: summary?.summary ?? null,
      checklist: summary?.checklist ?? [],
      replySuggestions: replies?.suggestions ?? [],
    };
  }

  private async loadThread(
    userId: UserId,
    threadId: ThreadId,
    options: ThreadDetailOptions,
  ): Promise<ThreadSummary> {
    const thread = await this.deps.threads.findById(userId, threadId);
    if (thread === null) {
      throw new NotFoundError('Thread', threadId);
    }
    const marker = this.deps.readMarker;
    if (options.markRead !== true || !thread.unread || marker === null) {
      return thread;
    }
    return marker.markRead(userId, threadId);
  }

  private async latest<Kind extends 'summary' | 'replySuggestions'>(
    userId: UserId,
    threadId: ThreadId,
    kind: Kind,
  ): Promise<AiOutputOf<Kind> | null> {
    const result = await this.deps.aiResults.findLatest(userId, threadId, kind);
    if (result?.output.kind !== kind) {
      return null;
    }
    return result.output as AiOutputOf<Kind>;
  }
}
