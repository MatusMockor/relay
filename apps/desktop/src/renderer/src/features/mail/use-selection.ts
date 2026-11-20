import { useEffect, useRef } from 'react';
import { folderKey } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import type { ListPaging } from '../../data/hooks/use-thread-list-paging';
import type { ListItem } from './list-items';
import { selectKey } from './selection';
import { replacementKeyOf } from './selection-fallback';
import { useFolderItems } from './use-folder-items';

export interface SelectionModel {
  readonly items: readonly ListItem[];
  readonly loading: boolean;
  readonly paging: ListPaging;
  readonly selectedKey: string | null;
  readonly current: ListItem | null;
}

interface ListSnapshot {
  readonly list: string;
  readonly items: readonly ListItem[];
  readonly settled: boolean;
}

const useRemovalReplacement = (
  current: ListSnapshot,
  stored: string | undefined,
  present: boolean,
): string | null => {
  const seen = useRef<ListSnapshot | null>(null);
  const previous = seen.current;
  const replacement =
    present ||
    stored === undefined ||
    !current.settled ||
    previous === null ||
    previous.list !== current.list
      ? null
      : replacementKeyOf(stored, previous.items, current.items);
  const { list, items, settled } = current;
  useEffect(() => {
    if (!settled) {
      return;
    }
    seen.current = { list, items, settled };
    if (replacement === null) {
      return;
    }
    selectKey(replacement);
  }, [list, items, settled, replacement]);
  return replacement;
};

const useListIdentity = (): string =>
  useUiStore((state) => `${folderKey(state.folder)}|${state.scope}|${state.query.trim()}`);

export const useSelection = (): SelectionModel => {
  const { items, loading, paging, placeholder } = useFolderItems();
  const list = useListIdentity();
  const stored = useUiStore((state) => state.selected[folderKey(state.folder)]);
  const openThreadId = useUiStore((state) => state.openThreadId);
  const present = stored !== undefined && items.some((item) => item.key === stored);
  const replacement = useRemovalReplacement(
    { list, items, settled: !loading && !placeholder },
    stored,
    present,
  );
  const selectedKey = present ? stored : (replacement ?? items[0]?.key ?? null);
  const focusKey = openThreadId ?? selectedKey;
  return {
    items,
    loading,
    paging,
    selectedKey,
    current: items.find((item) => item.key === focusKey) ?? null,
  };
};
