// @vitest-environment jsdom
import type { ThreadSummary } from '@relay/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { demoIds } from '../src/data/demo/seed/ids';
import {
  MAX_RECENT_SEARCHES,
  readRecentSearches,
  rememberSearch,
} from '../src/features/search/recent-searches';
import {
  searchListParams,
  serverSearchRequest,
  toggleChip,
} from '../src/features/search/search-filters';
import {
  EMPTY_SESSION,
  localResults,
  mergeLocal,
  mergeServer,
  serverResults,
} from '../src/features/search/search-session';
import { DEFAULT_SEARCH_FILTERS } from '../src/state/search-filters';

const threads = [...buildDemoState(new Date()).threads.values()].map((record) => record.summary);

const [a, b, c] = threads as [ThreadSummary, ThreadSummary, ThreadSummary, ...ThreadSummary[]];

const keys = (results: readonly { readonly key: string }[]) => results.map((item) => item.key);

describe('search session', () => {
  it('keeps the local order for the same query and appends new local results', () => {
    const first = mergeLocal(EMPTY_SESSION, 'q', [a, b]);
    const next = mergeLocal(first, 'q', [c, b, a]);

    expect(keys(localResults(next))).toEqual([a.id, b.id, c.id]);
  });

  it('starts over for a new query', () => {
    const first = mergeLocal(EMPTY_SESSION, 'q', [a]);
    const next = mergeLocal(first, 'r', [b]);

    expect(keys(localResults(next))).toEqual([b.id]);
  });

  it('appends server hits once, skips local ones and keeps them out of the local section later', () => {
    const local = mergeLocal(EMPTY_SESSION, 'q', [a]);
    const withServer = mergeServer(local, 'q', [a, b, b]);
    const again = mergeServer(withServer, 'q', [b]);
    const stale = mergeServer(again, 'old', [c]);
    const refreshed = mergeLocal(stale, 'q', [a, b]);

    expect(keys(localResults(refreshed))).toEqual([a.id]);
    expect(keys(serverResults(refreshed))).toEqual([b.id]);
  });
});

describe('search filters', () => {
  const folder = {
    kind: 'mailbox',
    mailboxId: demoIds.folder('fl', 'faktury'),
    accountId: demoIds.account('fl'),
  } as const;

  it('searches every folder by default', () => {
    expect(searchListParams(DEFAULT_SEARCH_FILTERS, ' dph ', folder, 'all')).toEqual({
      view: 'inbox',
      everywhere: true,
      accountId: undefined,
      q: 'dph',
      searchField: undefined,
      hasAttachment: undefined,
      unread: undefined,
    });
  });

  it('maps every chip to the list and server parameters', () => {
    const filters = ['folder', 'subject', 'hasAttachment', 'unread'].reduce(
      (current, chip) =>
        toggleChip(current, chip as 'folder' | 'subject' | 'hasAttachment' | 'unread'),
      DEFAULT_SEARCH_FILTERS,
    );
    const account = demoIds.account('fl');

    expect(searchListParams(filters, 'dph', folder, account)).toEqual({
      view: 'mailbox',
      mailboxId: folder.mailboxId,
      accountId: account,
      q: 'dph',
      searchField: 'subject',
      hasAttachment: true,
      unread: true,
    });
    expect(serverSearchRequest(filters, ' dph ', account, 'r1')).toEqual({
      requestId: 'r1',
      q: 'dph',
      accountId: account,
      searchField: 'subject',
      hasAttachment: true,
      unread: true,
    });
    expect(toggleChip(toggleChip(filters, 'from'), 'from').field).toBeNull();
    expect(toggleChip(filters, 'everywhere').scope).toBe('everywhere');
  });
});

describe('recent searches', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('keeps the newest eight searches without duplicates', () => {
    Array.from({ length: 10 }, (_, index) => `hľadanie ${String(index)}`).forEach(rememberSearch);
    rememberSearch('  HLADANIE 5 ');
    rememberSearch(' ');

    const recent = readRecentSearches();
    expect(recent).toHaveLength(MAX_RECENT_SEARCHES);
    expect(recent[0]).toBe('HLADANIE 5');
    expect(recent.filter((item) => item.toLowerCase().endsWith('5'))).toHaveLength(1);
  });

  it('ignores a broken stored value', () => {
    window.localStorage.setItem('relay.search.recent', '{"nie": "pole"}');

    expect(readRecentSearches()).toEqual([]);
  });
});
