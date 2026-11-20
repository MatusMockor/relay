import type { ThreadSummary } from '@relay/shared';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import type { SearchFilters } from '../../state/search-filters';
import { useUiStore } from '../../state/ui-store';
import { searchListParams } from './search-filters';
import { searchKeyOf } from './search-key';

export const LOCAL_SEARCH_LIMIT = 8;

export type LocalSearchStatus = 'pending' | 'ready' | 'error';

export interface LocalSearch {
  readonly key: string;
  readonly status: LocalSearchStatus;
  readonly threads: readonly ThreadSummary[];
}

const NONE: LocalSearch = { key: '', status: 'ready', threads: [] };

export const useLocalSearch = (query: string, filters: SearchFilters): LocalSearch => {
  const client = useClient();
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const q = query.trim();
  const params = { ...searchListParams(filters, q, folder, scope), limit: LOCAL_SEARCH_LIMIT };
  const list = useQuery({
    queryKey: queryKeys.threadList(params),
    queryFn: () => client.listThreads(params),
    enabled: q !== '',
    networkMode: client.kind === 'remote' ? 'online' : 'always',
  });
  if (q === '') {
    return NONE;
  }
  const key = searchKeyOf(q, filters);
  if (list.data !== undefined) {
    return { key, status: 'ready', threads: list.data.items };
  }
  return { key, status: list.isError ? 'error' : 'pending', threads: [] };
};
