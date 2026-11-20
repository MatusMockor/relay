import type { ThreadId } from '@relay/shared';
import {
  type AccountScope,
  type Folder,
  folderKey,
  INBOX,
  isAccountFolder,
} from '../../state/folders';
import { type RightTab, setUi, useUiStore } from '../../state/ui-store';
import type { ListItem } from './list-items';
import { selectKey } from './selection';

export const selectFolder = (folder: Folder): void => {
  setUi({
    folder,
    openThreadId: null,
    reply: null,
    searchOpen: false,
    query: '',
    searchFilters: null,
  });
};

export const selectScope = (scope: AccountScope): void => {
  setUi((state) => ({
    scope,
    openThreadId: null,
    reply: null,
    folder: isAccountFolder(state.folder) ? INBOX : state.folder,
  }));
};

export const openThread = (threadId: ThreadId): void => {
  setUi((state) => ({
    openThreadId: threadId,
    reply: state.reply?.threadId === threadId ? state.reply : null,
    selected: { ...state.selected, [folderKey(state.folder)]: threadId },
  }));
};

export const backToList = (): void => {
  setUi({ openThreadId: null, reply: null });
};

export const moveSelection = (items: readonly ListItem[], delta: number): ListItem | null => {
  if (items.length === 0) {
    return null;
  }
  const state = useUiStore.getState();
  const anchor = state.openThreadId ?? state.selected[folderKey(state.folder)] ?? items[0]?.key;
  const index = Math.max(
    0,
    items.findIndex((item) => item.key === anchor),
  );
  const next = items[Math.max(0, Math.min(items.length - 1, index + delta))] ?? null;
  if (next !== null) {
    selectKey(next.key);
  }
  return next;
};

export const toggleLeft = (visible: boolean): void => {
  setUi({ leftUser: !visible });
};

export const toggleRight = (): void => {
  setUi((state) => ({ rightOpen: !state.rightOpen }));
};

export const openRight = (tab: RightTab): void => {
  setUi({ rightOpen: true, rightTab: tab });
};

export const openSearch = (): void => {
  setUi({ searchOpen: true, openThreadId: null, reply: null });
};

export const closeSearch = (): void => {
  setUi({ searchOpen: false, query: '', searchFilters: null });
};

export const goBack = (): void => {
  if (useUiStore.getState().openThreadId !== null) {
    backToList();
    return;
  }
  closeSearch();
};
