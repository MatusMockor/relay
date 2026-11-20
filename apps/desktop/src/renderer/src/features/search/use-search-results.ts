import { useRef } from 'react';
import type { SearchFilters } from '../../state/search-filters';
import {
  EMPTY_SESSION,
  localResults,
  mergeLocal,
  mergeServer,
  type SearchResult,
  serverResults,
} from './search-session';
import { type LocalSearchStatus, useLocalSearch } from './use-local-search';
import { type ServerSearchState, useServerSearch } from './use-server-search';

export interface SearchResults {
  readonly local: readonly SearchResult[];
  readonly server: readonly SearchResult[];
  readonly serverState: ServerSearchState;
  readonly localStatus: LocalSearchStatus;
}

export const useSearchResults = (query: string, filters: SearchFilters): SearchResults => {
  const local = useLocalSearch(query, filters);
  const serverState = useServerSearch(query, filters);
  const session = useRef(EMPTY_SESSION);
  const withLocal = mergeLocal(session.current, local.key, local.threads);
  const merged =
    serverState.status === 'ok' || serverState.status === 'partial'
      ? mergeServer(withLocal, serverState.key, serverState.threads)
      : withLocal;
  session.current = merged;
  return {
    local: localResults(merged),
    server: serverResults(merged),
    serverState,
    localStatus: local.status,
  };
};
