import type {
  AccountId,
  JiraKey,
  Message,
  SplitId,
  ThreadId,
  ThreadState,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import type { Repositories } from '../../ports/repositories';
import type { EngineEvents } from './engine-events';
import { projectThreadSummary } from './thread-summary-projector';

export interface ThreadRefreshHint {
  readonly splitIds?: readonly SplitId[];
  readonly addSplitIds?: readonly SplitId[];
  readonly jiraKey?: JiraKey | null;
  readonly jiraActor?: string | null;
  readonly state?: ThreadState;
  readonly resolveState?: (
    existing: ThreadSummary | null,
    messages: readonly Message[],
  ) => ThreadState | undefined;
}

export type ThreadRefreshOutcome =
  | { readonly kind: 'upserted'; readonly thread: ThreadSummary }
  | { readonly kind: 'removed'; readonly threadId: ThreadId; readonly accountId: AccountId };

type ThreadRefreshRepositories = Pick<Repositories, 'threads' | 'messages' | 'aiResults'>;

export const refreshThread = async (
  repositories: ThreadRefreshRepositories,
  userId: UserId,
  accountId: AccountId,
  threadId: ThreadId,
  hint: ThreadRefreshHint = {},
): Promise<ThreadRefreshOutcome> => {
  const existing = await repositories.threads.lockForUpdate(accountId, threadId);
  const messages = await repositories.messages.listByThread(userId, threadId);
  const projected = projectThreadSummary({
    threadId,
    accountId,
    existing,
    messages,
    ...hint,
  });
  if (projected === null) {
    await repositories.aiResults.deleteByThread(threadId);
    await repositories.threads.delete(threadId);
    return { kind: 'removed', threadId, accountId };
  }
  const state = hint.resolveState?.(existing, messages) ?? projected.state;
  const thread = await repositories.threads.upsert({ ...projected, state });
  return { kind: 'upserted', thread };
};

export const publishThreadOutcomes = async (
  events: EngineEvents,
  userId: UserId,
  outcomes: readonly ThreadRefreshOutcome[],
): Promise<void> => {
  for (const outcome of outcomes) {
    if (outcome.kind === 'removed') {
      await events.emit(userId, 'thread.removed', {
        threadId: outcome.threadId,
        accountId: outcome.accountId,
      });
      continue;
    }
    await events.emit(userId, 'thread.upserted', { thread: outcome.thread });
  }
};
