import type { ThreadId } from '@relay/shared';
import { INBOX, usesThreadList } from '../../state/folders';
import type { SearchFilters } from '../../state/search-filters';
import { setUi } from '../../state/ui-store';
import { openThread } from '../mail/navigation';
import { rememberSearch } from './recent-searches';

export const openSearchPalette = (): void => {
  setUi({ overlay: { kind: 'search' } });
};

export const closeSearchPalette = (): void => {
  setUi({ overlay: null });
};

export const openSearchResult = (threadId: ThreadId, query: string): void => {
  rememberSearch(query);
  closeSearchPalette();
  openThread(threadId);
};

export const showResultsInList = (query: string, filters: SearchFilters): void => {
  const q = query.trim();
  if (q === '') {
    return;
  }
  rememberSearch(q);
  setUi((state) => ({
    overlay: null,
    folder: usesThreadList(state.folder) ? state.folder : INBOX,
    openThreadId: null,
    reply: null,
    searchOpen: true,
    query: q,
    searchFilters: filters,
  }));
};
