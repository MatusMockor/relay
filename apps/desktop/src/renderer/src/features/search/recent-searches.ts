import { z } from 'zod';
import { foldText } from '../../lib/text';

const RECENT_KEY = 'relay.search.recent';
export const MAX_RECENT_SEARCHES = 8;

const RecentSearchesSchema = z
  .array(z.string().trim().min(1).max(500))
  .transform((items) => items.slice(0, MAX_RECENT_SEARCHES));

export const readRecentSearches = (): readonly string[] => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    const parsed = RecentSearchesSchema.safeParse(raw);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const write = (items: readonly string[]): void => {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {
    return;
  }
};

export const rememberSearch = (query: string): void => {
  const value = query.trim();
  if (value === '') {
    return;
  }
  const folded = foldText(value);
  const rest = readRecentSearches().filter((item) => foldText(item) !== folded);
  write([value, ...rest].slice(0, MAX_RECENT_SEARCHES));
};
