import type { FolderView, ThreadSummary } from '@relay/shared';
import { useDrafts, useScheduled, useThreadList } from '../../data/hooks/use-mail-queries';
import { useUiStore } from '../../state/ui-store';
import { draftItems } from '../mail/list-items';

const unreadOf = (threads: readonly ThreadSummary[] | undefined): number =>
  (threads ?? []).filter((thread) => thread.unread).length;

export const useFolderCounts = (): Partial<Record<FolderView, number>> => {
  const scope = useUiStore((state) => state.scope);
  const accountId = scope === 'all' ? undefined : scope;
  const inbox = useThreadList({ view: 'inbox', accountId });
  const tasks = useThreadList({ view: 'tasks', accountId });
  const reminders = useThreadList({ view: 'reminders', accountId });
  const spam = useThreadList({ view: 'spam', accountId });
  const drafts = useDrafts();
  const scheduled = useScheduled();
  const inScope = (id: string) => accountId === undefined || id === accountId;
  return {
    inbox: unreadOf(inbox.data?.items),
    spam: unreadOf(spam.data?.items),
    tasks: tasks.data?.items.length ?? 0,
    reminders: reminders.data?.items.length ?? 0,
    drafts: draftItems(drafts.data ?? [], scheduled.data ?? []).filter(
      (item) => item.kind === 'draft' && inScope(item.draft.accountId),
    ).length,
    scheduled: (scheduled.data ?? []).filter((item) => inScope(item.accountId)).length,
  };
};
