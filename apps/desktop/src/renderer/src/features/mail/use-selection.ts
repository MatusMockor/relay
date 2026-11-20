import { folderKey } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import type { ListPaging } from '../../data/hooks/use-thread-list-paging';
import type { ListItem } from './list-items';
import { useFolderItems } from './use-folder-items';

export interface SelectionModel {
  readonly items: readonly ListItem[];
  readonly loading: boolean;
  readonly paging: ListPaging;
  readonly selectedKey: string | null;
  readonly current: ListItem | null;
}

export const useSelection = (): SelectionModel => {
  const { items, loading, paging } = useFolderItems();
  const stored = useUiStore((state) => state.selected[folderKey(state.folder)]);
  const openThreadId = useUiStore((state) => state.openThreadId);
  const selectedKey =
    stored !== undefined && items.some((item) => item.key === stored)
      ? stored
      : (items[0]?.key ?? null);
  const focusKey = openThreadId ?? selectedKey;
  return {
    items,
    loading,
    paging,
    selectedKey,
    current: items.find((item) => item.key === focusKey) ?? null,
  };
};
