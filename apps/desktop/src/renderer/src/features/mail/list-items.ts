import type { Draft, ScheduledSend, ThreadSummary } from '@relay/shared';

export type ListItem =
  | { readonly kind: 'thread'; readonly key: string; readonly thread: ThreadSummary }
  | { readonly kind: 'draft'; readonly key: string; readonly draft: Draft }
  | {
      readonly kind: 'scheduled';
      readonly key: string;
      readonly scheduled: ScheduledSend;
      readonly draft: Draft | null;
    };

export const threadItem = (thread: ThreadSummary): ListItem => ({
  kind: 'thread',
  key: thread.id,
  thread,
});

export const draftItems = (
  drafts: readonly Draft[],
  scheduled: readonly ScheduledSend[],
): ListItem[] => {
  const pending = new Set(scheduled.map((item) => item.draftId));
  return drafts
    .filter((draft) => !pending.has(draft.id))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((draft) => ({ kind: 'draft', key: draft.id, draft }));
};

export const scheduledItems = (
  scheduled: readonly ScheduledSend[],
  drafts: readonly Draft[],
): ListItem[] =>
  [...scheduled]
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
    .map((item) => ({
      kind: 'scheduled',
      key: item.id,
      scheduled: item,
      draft: drafts.find((draft) => draft.id === item.draftId) ?? null,
    }));

export const itemAccountId = (item: ListItem): string => {
  if (item.kind === 'thread') {
    return item.thread.accountId;
  }
  return item.kind === 'draft' ? item.draft.accountId : item.scheduled.accountId;
};
