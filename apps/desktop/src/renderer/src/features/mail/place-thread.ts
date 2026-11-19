import type { ThreadId } from '@relay/shared';
import { folderKey } from '../../state/folders';
import { setUi, useUiStore } from '../../state/ui-store';
import type { ThreadPlacement } from './thread-placement';

export const openThreadAt = (threadId: ThreadId, { folder, scope }: ThreadPlacement): void => {
  setUi((state) => ({
    scope,
    folder,
    openThreadId: threadId,
    reply: null,
    searchOpen: false,
    query: '',
    selected: { ...state.selected, [folderKey(folder)]: threadId },
  }));
};

export const relocateOpenThread = (
  threadId: ThreadId,
  { folder, scope }: ThreadPlacement,
): void => {
  if (useUiStore.getState().openThreadId !== threadId) {
    return;
  }
  setUi((state) => ({
    scope,
    folder,
    selected: { ...state.selected, [folderKey(folder)]: threadId },
  }));
};
