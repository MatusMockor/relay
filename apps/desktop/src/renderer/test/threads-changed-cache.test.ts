import {
  AccountIdSchema,
  type RealtimeEvent,
  type ThreadDetail,
  ThreadIdSchema,
  type ThreadPage,
} from '@relay/shared';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVALIDATION_WINDOW_MS } from '../src/data/hooks/invalidation-batch';
import { queryKeys } from '../src/data/hooks/query-keys';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { serverDetail, serverThread } from './support/thread-fixtures';

const ACCOUNT = AccountIdSchema.parse('acc-1');

const threadsChanged: RealtimeEvent = {
  type: 'threads.changed',
  at: '2026-11-15T08:00:00.000Z',
  data: { accountId: ACCOUNT, count: 300 },
};

const counted = (
  client: QueryClient,
  queryKey: readonly unknown[],
  data: ThreadPage | ThreadDetail,
) => {
  const counter = { fetches: 0 };
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: () => {
      counter.fetches += 1;
      return Promise.resolve(data);
    },
  });
  return { counter, unsubscribe: observer.subscribe(() => undefined) };
};

describe('threads.changed realtime event', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it('refetches thread lists and the cached threads of that account once', async () => {
    const own = serverThread('Faktúra');
    const foreign = serverThread('Cudzí účet', {
      id: ThreadIdSchema.parse('thread-2'),
      accountId: AccountIdSchema.parse('acc-2'),
    });
    const empty: ThreadPage = { items: [], nextCursor: null };
    const list = counted(client, queryKeys.threadList({ view: 'inbox' }), empty);
    const ownDetail = counted(client, queryKeys.thread(own.id), serverDetail(own, []));
    const foreignDetail = counted(client, queryKeys.thread(foreign.id), serverDetail(foreign, []));
    await vi.waitFor(() => {
      expect(client.getQueryData(queryKeys.thread(own.id))).toBeDefined();
      expect(client.getQueryData(queryKeys.thread(foreign.id))).toBeDefined();
    });
    expect([list, ownDetail, foreignDetail].map((entry) => entry.counter.fetches)).toEqual([
      1, 1, 1,
    ]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    applyRealtimeEvent(client, threadsChanged);
    applyRealtimeEvent(client, threadsChanged);
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS);
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS);

    expect([list, ownDetail, foreignDetail].map((entry) => entry.counter.fetches)).toEqual([
      2, 2, 1,
    ]);
    [list, ownDetail, foreignDetail].forEach((entry) => {
      entry.unsubscribe();
    });
  });
});
