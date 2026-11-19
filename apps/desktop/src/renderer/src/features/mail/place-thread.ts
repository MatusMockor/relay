import type { ThreadId } from '@relay/shared';
import { folderKey, sameFolder } from '../../state/folders';
import { setUi, type UiState, useUiStore } from '../../state/ui-store';
import { appHistory } from '../history/app-history';
import type { ThreadPlacement } from './thread-placement';

const placedAt = (state: UiState, threadId: ThreadId, { folder, scope }: ThreadPlacement) =>
  state.openThreadId === threadId && state.scope === scope && sameFolder(state.folder, folder);

export const openThreadAt = (
  threadId: ThreadId,
  placement: ThreadPlacement,
  extra: Partial<UiState> = {},
  tag: symbol | null = null,
): void => {
  if (placedAt(useUiStore.getState(), threadId, placement)) {
    appHistory.visit(() => {
      setUi(extra);
    }, tag);
    return;
  }
  appHistory.visit(() => {
    setUi({
      ...extra,
      ...placement,
      openThreadId: null,
      reply: null,
      searchOpen: false,
      query: '',
    });
  }, tag);
  appHistory.visit(() => {
    setUi((state) => ({
      openThreadId: threadId,
      selected: { ...state.selected, [folderKey(placement.folder)]: threadId },
    }));
  }, tag);
};

export const relocateOpenedThread = (tag: symbol, { folder, scope }: ThreadPlacement): void => {
  appHistory.rewrite((location, entryTag) =>
    entryTag === tag ? { ...location, folder, scope } : location,
  );
};
