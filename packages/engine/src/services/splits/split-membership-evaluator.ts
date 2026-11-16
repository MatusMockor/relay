import type {
  AccountId,
  Split,
  SplitId,
  ThreadId,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { MessageRepository } from '../../ports/message-repository';
import type { SplitMatcher } from '../../ports/split-matcher';
import type { SplitRepository } from '../../ports/split-repository';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { sameMembers } from '../sync/message-diff';

const PAGE_SIZE = 200;

export interface SplitMembershipEvaluatorDeps {
  readonly splits: SplitRepository;
  readonly messages: MessageRepository;
  readonly threads: ThreadRepository;
  readonly matcher: SplitMatcher;
  readonly unitOfWork: UnitOfWork;
}

export class SplitMembershipEvaluator {
  constructor(private readonly deps: SplitMembershipEvaluatorDeps) {}

  async evaluate(userId: UserId, accountId: AccountId): Promise<ThreadSummary[]> {
    const splits = await this.deps.splits.listForAccount(userId, accountId);
    const threads = new Map<ThreadId, ThreadSummary | null>();
    const membership = new Map<ThreadId, Set<SplitId>>();
    let cursor: string | null = null;
    do {
      const page = await this.deps.messages.listMatchSubjects(accountId, {
        cursor,
        limit: PAGE_SIZE,
      });
      for (const item of page.items) {
        const thread = await this.thread(threads, accountId, item.threadId);
        const matched = await this.deps.matcher.match({
          message: item.subject,
          jira: jiraOf(thread),
          splits,
        });
        const members = membership.get(item.threadId) ?? new Set<SplitId>();
        matched.forEach((splitId) => members.add(splitId));
        membership.set(item.threadId, members);
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return this.apply(userId, accountId, splits, threads, membership);
  }

  private apply(
    userId: UserId,
    accountId: AccountId,
    splits: readonly Split[],
    threads: ReadonlyMap<ThreadId, ThreadSummary | null>,
    membership: ReadonlyMap<ThreadId, ReadonlySet<SplitId>>,
  ): Promise<ThreadSummary[]> {
    const changed = [...membership.entries()].filter(([threadId, members]) => {
      const thread = threads.get(threadId) ?? null;
      return thread !== null && !sameMembers(thread.splitIds, [...members]);
    });
    return this.deps.unitOfWork.run(async (repositories) => {
      const current = await repositories.splits.listForAccount(userId, accountId);
      if (!sameSplits(current, splits)) {
        return [];
      }
      const saved: ThreadSummary[] = [];
      for (const [threadId, members] of changed) {
        const current = await repositories.threads.lockForUpdate(accountId, threadId);
        if (current !== null) {
          saved.push(await repositories.threads.upsert({ ...current, splitIds: [...members] }));
        }
      }
      return saved;
    });
  }

  private async thread(
    cache: Map<ThreadId, ThreadSummary | null>,
    accountId: AccountId,
    threadId: ThreadId,
  ): Promise<ThreadSummary | null> {
    if (cache.has(threadId)) {
      return cache.get(threadId) ?? null;
    }
    const thread = await this.deps.threads.findByIdForAccount(accountId, threadId);
    cache.set(threadId, thread);
    return thread;
  }
}

const jiraOf = (thread: ThreadSummary | null): JiraClassification | null =>
  thread?.jiraKey == null ? null : { jiraKey: thread.jiraKey, eventKind: 'other', actor: null };

const sameSplits = (current: readonly Split[], evaluated: readonly Split[]): boolean =>
  JSON.stringify(current) === JSON.stringify(evaluated);
