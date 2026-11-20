import type { ThreadSummary } from '@relay/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import type { SearchFilters } from '../../state/search-filters';
import { useUiStore } from '../../state/ui-store';
import { searchListParams } from './search-filters';
import { searchKeyOf } from './search-key';

export const LOCAL_SEARCH_LIMIT = 8;

export interface LocalSearch {
  readonly key: string;
  readonly threads: readonly ThreadSummary[];
}

const NONE: LocalSearch = { key: '', threads: [] };

export const useLocalSearch = (query: string, filters: SearchFilters): LocalSearch => {
  const client = useClient();
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const q = query.trim();
  const params = { ...searchListParams(filters, q, folder, scope), limit: LOCAL_SEARCH_LIMIT };
  const list = useQuery({
    queryKey: queryKeys.threadList(params),
    queryFn: () => client.listThreads(params),
    placeholderData: keepPreviousData,
    enabled: q !== '',
    networkMode: client.kind === 'remote' ? 'online' : 'always',
  });
  const settled = useRef<LocalSearch>(NONE);
  if (q === '') {
    settled.current = NONE;
    return NONE;
  }
  if (list.data !== undefined && !list.isPlaceholderData) {
    settled.current = { key: searchKeyOf(q, filters), threads: list.data.items };
  }
  return settled.current;
};
