import type { ThreadId, UserId } from '@relay/shared/domain';
import type { DraftRepository } from '../../ports/draft-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { EngineEvents } from '../shared/engine-events';

export class DraftThreadFlag {
  constructor(
    private readonly drafts: DraftRepository,
    private readonly threads: ThreadRepository,
    private readonly events: EngineEvents,
  ) {}

  async sync(userId: UserId, threadId: ThreadId | null): Promise<void> {
    if (threadId === null) {
      return;
    }
    const hasDraft = (await this.drafts.findByThread(userId, threadId)) !== null;
    const thread = await this.threads.setHasDraft(userId, threadId, hasDraft);
    if (thread === null) {
      return;
    }
    await this.events.emit(userId, 'thread.upserted', { thread });
  }
}
