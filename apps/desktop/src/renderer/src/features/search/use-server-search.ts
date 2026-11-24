import type { ServerSearchStatus, ThreadSummary } from '@relay/shared';
import { useEffect, useRef, useState } from 'react';
import type { MailClient } from '../../data/MailClient';
import { useClient } from '../../data/hooks/services-context';
import { useUiStore } from '../../state/ui-store';
import type { SearchFilters } from '../../state/search-filters';
import { serverSearchRequest } from './search-filters';
import { searchKeyOf } from './search-key';
import { useOnline } from './use-online';

export const SERVER_SEARCH_DEBOUNCE_MS = 300;

export type ServerSearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly key: string }
  | {
      readonly status: ServerSearchStatus;
      readonly key: string;
      readonly threads: readonly ThreadSummary[];
    };

const IDLE: ServerSearchState = { status: 'idle' };
const unsupportedClients = new WeakSet<MailClient>();

let requestCounter = 0;

const nextRequestId = (): string => {
  requestCounter += 1;
  return `search-${String(requestCounter)}`;
};

const searchable = (q: string, filters: SearchFilters): boolean =>
  q !== '' && filters.scope === 'everywhere';

export const useServerSearch = (query: string, filters: SearchFilters): ServerSearchState => {
  const client = useClient();
  const online = useOnline();
  const scope = useUiStore((state) => state.scope);
  const [state, setState] = useState<ServerSearchState>(IDLE);
  const q = query.trim();
  const key = searchKeyOf(q, filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const enabled = searchable(q, filters) && online && !unsupportedClients.has(client);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    const requestId = nextRequestId();
    const timer = setTimeout(() => {
      client.searchServer(serverSearchRequest(filtersRef.current, q, scope, requestId)).then(
        (response) => {
          if (!live || response.requestId !== requestId) {
            return;
          }
          if (response.status === 'unsupported') {
            unsupportedClients.add(client);
          }
          setState({
            status: response.status,
            key,
            threads: response.hits.map((hit) => hit.thread),
          });
        },
        () => {
          if (live) {
            setState({ status: 'skipped', key, threads: [] });
          }
        },
      );
    }, SERVER_SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, enabled, key, q, scope]);
  if (!searchable(q, filters)) {
    return IDLE;
  }
  if (unsupportedClients.has(client)) {
    return { status: 'unsupported', key, threads: [] };
  }
  if (!online) {
    return { status: 'offline', key, threads: [] };
  }
  if (state.status === 'idle' || state.key !== key) {
    return { status: 'pending', key };
  }
  return state;
};
