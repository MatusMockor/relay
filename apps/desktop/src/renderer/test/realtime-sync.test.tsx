// @vitest-environment jsdom
import {
  type RealtimeEvent,
  TaskIdSchema,
  ThreadIdSchema,
  type ThreadPage,
  type ThreadSummary,
  UserIdSchema,
} from '@relay/shared';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../src/data/hooks/query-keys';
import { INVALIDATION_WINDOW_MS } from '../src/data/hooks/invalidation-batch';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { ServicesProvider } from '../src/data/hooks/services-context';
import { useThreadDetail, useThreadList } from '../src/data/hooks/use-mail-queries';
import { useRealtimeSync } from '../src/data/hooks/use-realtime-sync';
import type { MailClient } from '../src/data/MailClient';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { serverDetail, serverThread } from './support/thread-fixtures';

const THREAD_ID = ThreadIdSchema.parse('thread-1');

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (check: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < 3_000) {
    await pause(10);
  }
  expect(check()).toBe(true);
};

const upserted = (thread: ThreadSummary): RealtimeEvent => ({
  type: 'thread.upserted',
  at: '2026-11-15T08:00:00.000Z',
  data: { thread },
});

const taskUpserted: RealtimeEvent = {
  type: 'task.upserted',
  at: '2026-11-15T08:00:00.000Z',
  data: {
    task: {
      id: TaskIdSchema.parse('task-1'),
      userId: UserIdSchema.parse('user-1'),
      threadId: THREAD_ID,
      jiraKey: null,
      title: 'Pozrieť texty',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      createdAt: '2026-11-15T08:00:00.000Z',
      updatedAt: '2026-11-15T08:00:00.000Z',
    },
  },
};

const splitsUpdated: RealtimeEvent = {
  type: 'splits.updated',
  at: '2026-11-15T08:00:00.000Z',
  data: { splits: [] },
};

describe('realtime cache sync', () => {
  let server: ContractServer;
  let client: MailClient;
  let queryClient: QueryClient;

  beforeEach(async () => {
    server = await startContractServer();
    server.onSocketMessage((socket, text) => {
      if ((JSON.parse(text) as { type: string }).type === 'hello') {
        socket.send(JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }));
      }
    });
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    client.dispose();
    queryClient.clear();
    await server.close();
  });

  const count = (key: string) => server.requests.filter((request) => request.key === key).length;

  it('refetches thread lists and the open thread after the realtime connection comes back', async () => {
    const thread = serverThread('Pred výpadkom');
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ServicesProvider
          services={{ mode: 'synced', client, server: null, serverUrl: server.url }}
        >
          {children}
        </ServicesProvider>
      </QueryClientProvider>
    );
    renderHook(
      () => {
        useRealtimeSync();
        useThreadList({ view: 'inbox' });
        useThreadDetail(THREAD_ID);
      },
      { wrapper },
    );
    await waitUntil(() => server.sockets[0]?.messages.length === 1);
    await waitUntil(
      () =>
        count('threads.list') >= 2 && count('threads.get') >= 2 && queryClient.isFetching() === 0,
    );
    const lists = count('threads.list');
    const details = count('threads.get');
    server.sockets[0]?.close();
    await waitUntil(() => server.sockets[1]?.messages.length === 1);
    await waitUntil(() => count('threads.list') > lists && count('threads.get') > details);
  });

  it('coalesces thread list refetches during a burst of thread updates', async () => {
    let fetches = 0;
    const observer = new QueryObserver<ThreadPage>(queryClient, {
      queryKey: queryKeys.threadList({ view: 'inbox' }),
      queryFn: () => {
        fetches += 1;
        return Promise.resolve({ items: [], nextCursor: null });
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await waitUntil(() => fetches === 1);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (let index = 0; index < 5; index += 1) {
      applyRealtimeEvent(queryClient, upserted(serverThread(`Správa ${String(index)}`)));
      await vi.advanceTimersByTimeAsync(5);
    }
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS);
    await vi.advanceTimersByTimeAsync(INVALIDATION_WINDOW_MS);
    unsubscribe();
    expect(fetches).toBe(2);
  });

  it.each([
    ['task.upserted', taskUpserted],
    ['splits.updated', splitsUpdated],
  ])('refetches thread lists after %s', async (_name, event) => {
    let fetches = 0;
    const observer = new QueryObserver<ThreadPage>(queryClient, {
      queryKey: queryKeys.threadList({ view: 'inbox' }),
      queryFn: () => {
        fetches += 1;
        return Promise.resolve({ items: [], nextCursor: null });
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await waitUntil(() => fetches === 1);
    applyRealtimeEvent(queryClient, event);
    await waitUntil(() => fetches === 2);
    unsubscribe();
  });
});
