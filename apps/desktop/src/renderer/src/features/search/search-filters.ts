import type { ServerSearchRequest } from '@relay/shared';
import type { ThreadListParams } from '../../data/MailClient';
import { type AccountScope, type Folder, listParamsOf } from '../../state/folders';
import type { SearchFilters } from '../../state/search-filters';

export type SearchChip = 'everywhere' | 'from' | 'subject' | 'hasAttachment' | 'unread' | 'folder';

export const SEARCH_CHIPS: readonly { readonly chip: SearchChip; readonly label: string }[] = [
  { chip: 'everywhere', label: 'Všetko' },
  { chip: 'from', label: 'Od' },
  { chip: 'subject', label: 'Predmet' },
  { chip: 'hasAttachment', label: 'Má prílohu' },
  { chip: 'unread', label: 'Neprečítané' },
  { chip: 'folder', label: 'Tento priečinok' },
];

export const isChipOn = (filters: SearchFilters, chip: SearchChip): boolean => {
  if (chip === 'everywhere' || chip === 'folder') {
    return filters.scope === chip;
  }
  if (chip === 'from' || chip === 'subject') {
    return filters.field === chip;
  }
  return filters[chip];
};

export const toggleChip = (filters: SearchFilters, chip: SearchChip): SearchFilters => {
  if (chip === 'everywhere' || chip === 'folder') {
    return { ...filters, scope: chip };
  }
  if (chip === 'from' || chip === 'subject') {
    return { ...filters, field: filters.field === chip ? null : chip };
  }
  return { ...filters, [chip]: !filters[chip] };
};

const flag = (on: boolean): true | undefined => (on ? true : undefined);

const filterParams = (filters: SearchFilters) => ({
  searchField: filters.field ?? undefined,
  hasAttachment: flag(filters.hasAttachment),
  unread: flag(filters.unread),
});

const trimmed = (q: string): string | undefined => (q.trim() === '' ? undefined : q.trim());

export const searchListParams = (
  filters: SearchFilters,
  q: string,
  folder: Folder,
  scope: AccountScope,
): ThreadListParams => {
  if (filters.scope === 'folder') {
    return { ...listParamsOf(folder, scope, q), ...filterParams(filters) };
  }
  return {
    view: 'inbox',
    everywhere: true,
    accountId: scope === 'all' ? undefined : scope,
    q: trimmed(q),
    ...filterParams(filters),
  };
};

export const serverSearchRequest = (
  filters: SearchFilters,
  q: string,
  scope: AccountScope,
  requestId: string,
): ServerSearchRequest => ({
  requestId,
  q: q.trim(),
  accountId: scope === 'all' ? undefined : scope,
  ...filterParams(filters),
});
