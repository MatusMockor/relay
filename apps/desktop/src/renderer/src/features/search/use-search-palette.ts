import { useId, useState } from 'react';
import { DEFAULT_SEARCH_FILTERS, type SearchFilters } from '../../state/search-filters';
import { useUiStore } from '../../state/ui-store';
import { openSearchResult, showResultsInList } from './search-actions';
import { type SearchChip, toggleChip } from './search-filters';
import type { SearchResult } from './search-session';
import { readRecentSearches } from './recent-searches';
import { type SearchResults, useSearchResults } from './use-search-results';

export type PaletteEntry =
  | { readonly kind: 'recent'; readonly key: string; readonly query: string }
  | { readonly kind: 'result'; readonly key: string; readonly result: SearchResult };

export interface SearchPaletteModel {
  readonly query: string;
  readonly filters: SearchFilters;
  readonly results: SearchResults;
  readonly entries: readonly PaletteEntry[];
  readonly active: PaletteEntry | undefined;
  readonly listId: string;
  readonly followActive: boolean;
  readonly optionId: (entry: PaletteEntry) => string;
  readonly setQuery: (value: string) => void;
  readonly toggle: (chip: SearchChip) => void;
  readonly hover: (entry: PaletteEntry) => void;
  readonly move: (delta: number) => void;
  readonly pick: (entry: PaletteEntry | undefined) => void;
  readonly showAll: () => void;
}

const initialQuery = (): string => {
  const ui = useUiStore.getState();
  return ui.searchOpen ? ui.query : '';
};

const initialFilters = (): SearchFilters =>
  useUiStore.getState().searchFilters ?? DEFAULT_SEARCH_FILTERS;

const resultEntry = (result: SearchResult): PaletteEntry => ({
  kind: 'result',
  key: `${result.source}:${result.key}`,
  result,
});

export const useSearchPalette = (): SearchPaletteModel => {
  const [query, setQueryValue] = useState(initialQuery);
  const [filters, setFilters] = useState(initialFilters);
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const [recent] = useState(readRecentSearches);
  const listId = useId();
  const [followActive, setFollowActive] = useState(false);
  const results = useSearchResults(query, filters);
  const entries: PaletteEntry[] =
    query.trim() === ''
      ? recent.map((item) => ({ kind: 'recent', key: `recent:${item}`, query: item }))
      : [...results.local, ...results.server].map(resultEntry);
  const active = entries.find((entry) => entry.key === cursorKey) ?? entries[0];
  const setQuery = (value: string) => {
    setQueryValue(value);
    setCursorKey(null);
  };
  return {
    query,
    filters,
    results,
    entries,
    active,
    listId,
    followActive,
    optionId: (entry) => `${listId}-${String(entries.indexOf(entry))}`,
    setQuery,
    toggle: (chip) => {
      setFilters((current) => toggleChip(current, chip));
      setCursorKey(null);
    },
    hover: (entry) => {
      setFollowActive(false);
      setCursorKey(entry.key);
    },
    move: (delta) => {
      const index = active === undefined ? 0 : entries.indexOf(active);
      const next = entries[Math.max(0, Math.min(entries.length - 1, index + delta))];
      setFollowActive(true);
      setCursorKey(next?.key ?? null);
    },
    pick: (entry) => {
      if (entry === undefined) {
        return;
      }
      if (entry.kind === 'recent') {
        setQuery(entry.query);
        return;
      }
      openSearchResult(entry.result.thread.id, query);
    },
    showAll: () => {
      showResultsInList(query, filters);
    },
  };
};
