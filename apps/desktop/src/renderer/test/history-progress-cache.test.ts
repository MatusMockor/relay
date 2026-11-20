import type { HistoryProgress, MailAccount, RealtimeEvent } from '@relay/shared';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { INVALIDATION_WINDOW_MS } from '../src/data/hooks/invalidation-batch';
import { queryKeys } from '../src/data/hooks/query-keys';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { present } from './support/present';

const AT = '2026-11-15T08:00:00.000Z';

const watchProgress = (client: QueryClient) => {
  const counter = { fetches: 0 };
  const observer = new QueryObserver<HistoryProgress[]>(client, {
    queryKey: queryKeys.historyProgress(),
    queryFn: () => {
      counter.fetches += 1;
      return Promise.resolve([]);
    },
  });
  return { counter, unsubscribe: observer.subscribe(() => undefined) };
};

interface AccountEvents {
  readonly upserted: RealtimeEvent;
  readonly removed: RealtimeEvent;
  readonly status: RealtimeEvent;
}

const accountEvents = (account: MailAccount): AccountEvents => ({
  upserted: { type: 'account.upserted', at: AT, data: { account } },
  removed: { type: 'account.removed', at: AT, data: { accountId: account.id } },
  status: {
    type: 'account.status',
    at: AT,
    data: { accountId: account.id, status: 'connected', error: null, lastSyncedAt: AT },
  },
});

describe('history progress cache', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it('refetches the progress when an account is added or removed but not on a status change', async () => {
    const [account] = await createDemoMailClient().listAccounts();
    const events = accountEvents(present(account));
    const progress = watchProgress(client);
    await vi.waitFor(() => {
      expect(progress.counter.fetches).toBe(1);
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    applyRealtimeEvent(client, events.status);
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS * 2);
    expect(progress.counter.fetches).toBe(1);

    applyRealtimeEvent(client, events.removed);
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS * 2);
    expect(progress.counter.fetches).toBe(2);

    applyRealtimeEvent(client, events.upserted);
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS * 2);
    expect(progress.counter.fetches).toBe(3);
    progress.unsubscribe();
  });
});
