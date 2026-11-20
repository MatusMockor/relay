import type { ThreadListParams } from '../../data/MailClient';
import { listParamsOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { searchListParams } from '../search/search-filters';

export const useListParams = (): ThreadListParams => {
  const folder = useUiStore((state) => state.folder);
  const scope = useUiStore((state) => state.scope);
  const query = useUiStore((state) => state.query);
  const filters = useUiStore((state) => state.searchFilters);
  if (filters === null || query.trim() === '') {
    return listParamsOf(folder, scope, query);
  }
  return searchListParams(filters, query, folder, scope);
};
