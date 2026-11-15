import { folderKey } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import type { ListItem } from './list-items';

export const selectedKeyOf = (items: readonly ListItem[]): string | null => {
  const state = useUiStore.getState();
  const stored = state.selected[folderKey(state.folder)];
  if (stored !== undefined && items.some((item) => item.key === stored)) {
    return stored;
  }
  return items[0]?.key ?? null;
};

export const selectKey = (key: string): void => {
  useUiStore.setState((state) => ({
    selected: { ...state.selected, [folderKey(state.folder)]: key },
  }));
};

export const neighborOf = (items: readonly ListItem[], key: string): ListItem | null => {
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) {
    return null;
  }
  return items[index + 1] ?? items[index - 1] ?? null;
};
