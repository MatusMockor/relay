import type { Message, ThreadId, ThreadSummary, UserId } from '@relay/shared/domain';
import type { ServerSearchHit } from '@relay/shared/api';
import type { ThreadRepository } from '../../ports/thread-repository';

export interface SearchHitFilters {
  readonly hasAttachment?: boolean;
  readonly unread?: boolean;
}

const HIDDEN_STATES: ReadonlySet<ThreadSummary['state']> = new Set(['trash', 'spam']);

const hasRealAttachment = (message: Message): boolean =>
  message.attachments.some((attachment) => !attachment.inline);

export class SearchHits {
  private readonly byThread = new Map<ThreadId, ServerSearchHit>();

  constructor(
    private readonly threads: ThreadRepository,
    private readonly userId: UserId,
    private readonly filters: SearchHitFilters,
  ) {}

  async add(messages: readonly Message[]): Promise<void> {
    for (const message of messages) {
      await this.addOne(message);
    }
  }

  list(): ServerSearchHit[] {
    return [...this.byThread.values()].sort(
      (left, right) => Date.parse(right.date) - Date.parse(left.date),
    );
  }

  private async addOne(message: Message): Promise<void> {
    if (this.filters.hasAttachment === true && !hasRealAttachment(message)) {
      return;
    }
    const existing = this.byThread.get(message.threadId);
    if (existing !== undefined && Date.parse(existing.date) >= Date.parse(message.date)) {
      return;
    }
    const thread = await this.threads.findById(this.userId, message.threadId);
    if (thread === null || HIDDEN_STATES.has(thread.state)) {
      return;
    }
    if (this.filters.unread === true && !thread.unread) {
      return;
    }
    this.byThread.set(thread.id, { thread, messageId: message.id, date: message.date });
  }
}
