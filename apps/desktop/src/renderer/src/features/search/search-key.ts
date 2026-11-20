import type { SearchFilters } from '../../state/search-filters';

export const searchKeyOf = (query: string, filters: SearchFilters): string =>
  JSON.stringify([
    query.trim(),
    filters.scope,
    filters.field,
    filters.hasAttachment,
    filters.unread,
  ]);
