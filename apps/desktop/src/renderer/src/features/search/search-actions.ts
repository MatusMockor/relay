import type { ThreadId } from '@relay/shared';
import { INBOX, usesThreadList } from '../../state/folders';
import type { SearchFilters } from '../../state/search-filters';
import { setUi, useUiStore } from '../../state/ui-store';
import { runBackGuards } from '../mail/back-guards';
import { openThread } from '../mail/navigation';
import { rememberSearch } from './recent-searches';

export const openSearchPalette = (): void => {
  setUi({ overlay: { kind: 'search' } });
};

export const closeSearchPalette = (): void => {
  setUi({ overlay: null });
};

const leaveReply = (target: ThreadId | null): void => {
  const { reply } = useUiStore.getState();
  if (reply === null || reply.threadId === target) {
    return;
  }
  runBackGuards();
};

export const openSearchResult = (threadId: ThreadId, query: string): void => {
  rememberSearch(query);
  closeSearchPalette();
  leaveReply(threadId);
  openThread(threadId);
};

export const showResultsInList = (query: string, filters: SearchFilters): void => {
  const q = query.trim();
  if (q === '') {
    return;
  }
  rememberSearch(q);
  closeSearchPalette();
  leaveReply(null);
  setUi((state) => ({
    folder: usesThreadList(state.folder) ? state.folder : INBOX,
    openThreadId: null,
    reply: null,
    searchOpen: true,
    query: q,
    searchFilters: filters,
  }));
};
