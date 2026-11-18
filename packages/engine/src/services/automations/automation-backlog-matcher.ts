import type {
  AccountId,
  Automation,
  MessageId,
  ThreadId,
  ThreadSummary,
} from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { AutomationMatcher } from '../../ports/automation-matcher';
import type { MessageRepository } from '../../ports/message-repository';
import type { ThreadRepository } from '../../ports/thread-repository';

const PAGE_SIZE = 200;

export interface BacklogMatch {
  readonly thread: ThreadSummary;
  readonly messageIds: readonly MessageId[];
}

export interface AutomationBacklogMatcherDeps {
  readonly messages: MessageRepository;
  readonly threads: ThreadRepository;
  readonly matcher: AutomationMatcher;
}

const jiraOf = (thread: ThreadSummary): JiraClassification | null =>
  thread.jiraKey === null ? null : { jiraKey: thread.jiraKey, eventKind: 'other', actor: null };

export class AutomationBacklogMatcher {
  constructor(private readonly deps: AutomationBacklogMatcherDeps) {}

  async inboxMatches(accountId: AccountId, automation: Automation): Promise<BacklogMatch[]> {
    const threads = new Map<ThreadId, ThreadSummary | null>();
    const matched = new Map<ThreadId, MessageId[]>();
    let cursor: string | null = null;
    do {
      const page = await this.deps.messages.listMatchSubjects(accountId, {
        cursor,
        limit: PAGE_SIZE,
      });
      for (const item of page.items) {
        const thread = await this.inboxThread(threads, accountId, item.threadId);
        if (thread === null) {
          continue;
        }
        const matches = await this.deps.matcher.matches({
          message: item.subject,
          jira: jiraOf(thread),
          conditions: automation.conditions,
        });
        if (matches) {
          matched.set(thread.id, [...(matched.get(thread.id) ?? []), item.messageId]);
        }
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return [...matched.entries()].flatMap(([threadId, messageIds]) => {
      const thread = threads.get(threadId) ?? null;
      return thread === null ? [] : [{ thread, messageIds }];
    });
  }

  private async inboxThread(
    cache: Map<ThreadId, ThreadSummary | null>,
    accountId: AccountId,
    threadId: ThreadId,
  ): Promise<ThreadSummary | null> {
    if (!cache.has(threadId)) {
      const thread = await this.deps.threads.findByIdForAccount(accountId, threadId);
      cache.set(threadId, thread?.state === 'inbox' ? thread : null);
    }
    return cache.get(threadId) ?? null;
  }
}
