import { useMemo } from 'react';
import { useDrafts, useScheduled, useThreadList } from '../../data/hooks/use-mail-queries';
import {
  type ListPaging,
  NO_PAGING,
  useThreadListPaging,
} from '../../data/hooks/use-thread-list-paging';
import { usesThreadList } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { draftItems, type ListItem, scheduledItems, threadItem } from './list-items';
import { useListParams } from './use-list-params';

export interface FolderItems {
  readonly items: readonly ListItem[];
  readonly loading: boolean;
  readonly paging: ListPaging;
  readonly placeholder: boolean;
}

export const useFolderItems = (): FolderItems => {
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const isDrafts = folder.kind === 'view' && folder.view === 'drafts';
  const isScheduled = folder.kind === 'view' && folder.view === 'scheduled';
  const params = useListParams();
  const threads = useThreadList(params, usesThreadList(folder));
  const threadPaging = useThreadListPaging(
    params,
    threads.isPlaceholderData ? undefined : threads.data,
  );
  const paging = usesThreadList(folder) ? threadPaging : NO_PAGING;
  const drafts = useDrafts();
  const scheduled = useScheduled();
  const listed = useMemo(() => {
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
        loading: drafts.isPending || scheduled.isPending,
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
  const placeholder = usesThreadList(folder) && threads.isPlaceholderData;
  return { ...listed, paging, placeholder };
};
