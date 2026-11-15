import { useMemo } from 'react';
import { useDrafts, useScheduled, useThreadList } from '../../data/hooks/use-mail-queries';
import { listParamsOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { draftItems, type ListItem, scheduledItems, threadItem } from './list-items';

export interface FolderItems {
  readonly items: readonly ListItem[];
  readonly loading: boolean;
}

export const useFolderItems = (): FolderItems => {
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const query = useUiStore((state) => state.query);
  const isDrafts = folder.kind === 'view' && folder.view === 'drafts';
  const isScheduled = folder.kind === 'view' && folder.view === 'scheduled';
  const threads = useThreadList(listParamsOf(folder, scope, query), !isDrafts && !isScheduled);
  const drafts = useDrafts();
  const scheduled = useScheduled();
  return useMemo(() => {
    const inScope = (item: ListItem) =>
      scope === 'all' ||
      (item.kind === 'thread'
        ? item.thread.accountId
        : item.kind === 'draft'
          ? item.draft.accountId
          : item.scheduled.accountId) === scope;
    if (isDrafts) {
      return {
        items: draftItems(drafts.data ?? [], scheduled.data ?? []).filter(inScope),
        loading: drafts.isPending,
      };
    }
    if (isScheduled) {
      return {
        items: scheduledItems(scheduled.data ?? [], drafts.data ?? []).filter(inScope),
        loading: scheduled.isPending,
      };
    }
    return { items: (threads.data?.items ?? []).map(threadItem), loading: threads.isPending };
  }, [
    isDrafts,
    isScheduled,
    drafts.data,
    drafts.isPending,
    scheduled.data,
    scheduled.isPending,
    threads.data,
    threads.isPending,
    scope,
  ]);
};
