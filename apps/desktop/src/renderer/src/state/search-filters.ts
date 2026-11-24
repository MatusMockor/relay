import type { ThreadSearchField } from '@relay/shared';

export type SearchScope = 'everywhere' | 'folder';

export interface SearchFilters {
  readonly scope: SearchScope;
  readonly field: ThreadSearchField | null;
  readonly hasAttachment: boolean;
  readonly unread: boolean;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  scope: 'everywhere',
  field: null,
  hasAttachment: false,
  unread: false,
};
