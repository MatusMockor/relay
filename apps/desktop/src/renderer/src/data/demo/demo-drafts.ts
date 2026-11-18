import type { AccountId, DraftId, ThreadId, ThreadSummary } from '@relay/shared';
import type { DemoState } from './demo-state';

export const syncDraftFlags = (
  state: DemoState,
  threadIds: readonly (ThreadId | null)[],
): ThreadSummary[] =>
  [...new Set(threadIds)].flatMap((threadId) => {
    const record = threadId === null ? undefined : state.threads.get(threadId);
    if (record === undefined) {
      return [];
    }
    const hasDraft = state.drafts.some((item) => item.inReplyToThreadId === threadId);
    if (record.summary.hasDraft === hasDraft) {
      return [];
    }
    record.summary = { ...record.summary, hasDraft };
    return [record.summary];
  });

export const dropAccountData = (state: DemoState, accountId: AccountId): void => {
  state.accounts = state.accounts.filter((account) => account.id !== accountId);
  state.drafts = state.drafts.filter((item) => item.accountId !== accountId);
  state.scheduled = state.scheduled.filter((item) => item.accountId !== accountId);
  state.labels = state.labels.filter((item) => item.accountId !== accountId);
  state.mailboxes = state.mailboxes.filter((item) => item.accountId !== accountId);
  [...state.threads.entries()]
    .filter(([, item]) => item.summary.accountId === accountId)
    .forEach(([key]) => state.threads.delete(key));
};

export const removeDraft = (state: DemoState, draftId: DraftId): void => {
  state.drafts = state.drafts.filter((item) => item.id !== draftId);
  state.scheduled = state.scheduled.filter((item) => item.draftId !== draftId);
};
