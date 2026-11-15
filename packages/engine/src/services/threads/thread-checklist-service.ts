import type { ChecklistResponse, UpdateChecklistItemBody } from '@relay/shared/api';
import type { ThreadId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AiResultRepository } from '../../ports/ai-result-repository';
import type { ThreadRepository } from '../../ports/thread-repository';

export interface ThreadChecklistServiceDeps {
  readonly threads: ThreadRepository;
  readonly aiResults: AiResultRepository;
}

export class ThreadChecklistService {
  constructor(private readonly deps: ThreadChecklistServiceDeps) {}

  async update(
    userId: UserId,
    threadId: ThreadId,
    body: UpdateChecklistItemBody,
  ): Promise<ChecklistResponse> {
    if ((await this.deps.threads.findById(userId, threadId)) === null) {
      throw new NotFoundError('Thread', threadId);
    }
    const result = await this.deps.aiResults.findLatest(userId, threadId, 'summary');
    if (result === null) {
      throw new NotFoundError('Checklist of thread', threadId);
    }
    const updated = await this.deps.aiResults.updateChecklistItem(userId, result.id, body);
    if (updated?.output.kind !== 'summary') {
      throw new NotFoundError('Checklist item', body.itemId);
    }
    return { checklist: updated.output.checklist };
  }
}
