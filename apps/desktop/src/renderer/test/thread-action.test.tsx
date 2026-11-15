// @vitest-environment jsdom
import { type ThreadSummary, ThreadIdSchema } from '@relay/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '../src/data/hooks/query-keys';
import { ServicesProvider } from '../src/data/hooks/services-context';
import { useThreadDetail } from '../src/data/hooks/use-mail-queries';
import { useThreadAction } from '../src/data/hooks/use-thread-action';
import type { MailClient } from '../src/data/MailClient';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { gate } from './support/gate';
import { serverDetail, serverThread } from './support/thread-fixtures';

const THREAD_ID = ThreadIdSchema.parse('thread-1');
const FAILURE = { error: { code: 'internal', message: 'Server neodpovedá' } };

describe('thread actions on the detail cache', () => {
  let server: ContractServer;
  let client: MailClient;
  let queryClient: QueryClient;
  let stored: ThreadSummary;
  let store: MemoryTokenStore;

  beforeEach(async () => {
    server = await startContractServer();
    stored = serverThread('Faktúra za október');
    store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = remoteClient();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(async () => {
    cleanup();
    client.dispose();
    queryClient.clear();
    await server.close();
  });

  const remoteClient = () =>
    createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
    });

  const renderAction = (mailClient = client, cache = queryClient) => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={cache}>
        <ServicesProvider
          services={{ mode: 'synced', client: mailClient, server: null, serverUrl: server.url }}
        >
          {children}
        </ServicesProvider>
      </QueryClientProvider>
    );
    return renderHook(() => ({ detail: useThreadDetail(THREAD_ID), action: useThreadAction() }), {
      wrapper,
    });
  };

  const settled = async () => {
    await waitFor(() => {
      expect(queryClient.isMutating() + queryClient.isFetching()).toBe(0);
    });
  };

  const count = (key: string) => server.requests.filter((request) => request.key === key).length;

  it('does not let an older detail response undo the action', async () => {
    const stale = gate();
    let hold: Promise<void> | undefined;
    server.handle('threads.get', () => ({ holdUntil: hold, body: serverDetail(stored, []) }));
    server.handle('threads.action', () => {
      stored = { ...stored, state: 'done' };
      return { body: stored };
    });
    const { result } = renderAction();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    hold = stale.wait();
    act(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread(THREAD_ID) });
    });
    await waitFor(() => {
      expect(count('threads.get')).toBe(2);
    });
    hold = undefined;
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(1);
    });
    stale.open();
    await settled();
    expect(result.current.detail.data?.thread.state).toBe('done');
  });

  it('returns to the server state when two overlapping actions both fail', async () => {
    const failures = gate();
    server.handle('threads.get', () => ({ body: serverDetail(stored, []) }));
    server.handle('threads.action', () => ({
      holdUntil: failures.wait(),
      status: 500,
      body: FAILURE,
    }));
    const { result } = renderAction();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'markUnread' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(1);
    });
    failures.open();
    await waitFor(() => {
      expect(count('threads.action')).toBe(2);
    });
    await settled();
    expect(result.current.detail.data?.thread.state).toBe('inbox');
    expect(result.current.detail.data?.thread.unread).toBe(false);
  });

  it('keeps a later success when an earlier overlapping action failed', async () => {
    let delayMs = 0;
    let actions = 0;
    server.handle('threads.get', () => ({ delayMs, body: serverDetail(stored, []) }));
    server.handle('threads.action', () => {
      actions += 1;
      if (actions === 1) {
        return { delayMs: 40, status: 500, body: FAILURE };
      }
      const updated = { ...stored, unread: true };
      setTimeout(() => {
        stored = updated;
      }, 30);
      return { delayMs: 40, body: updated };
    });
    const { result } = renderAction();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    delayMs = 100;
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'markUnread' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(2);
    });
    await settled();
    expect(result.current.detail.data?.thread.unread).toBe(true);
    expect(result.current.detail.data?.thread.state).toBe('inbox');
  });

  it('does not make a new session wait for an action of the old session', async () => {
    const hung = gate();
    let actions = 0;
    server.handle('threads.get', () => ({ body: serverDetail(stored, []) }));
    server.handle('threads.action', () => {
      actions += 1;
      return { holdUntil: actions === 1 ? hung.wait() : undefined, body: stored };
    });
    const older = renderAction();
    await waitFor(() => {
      expect(older.result.current.detail.data?.thread.state).toBe('inbox');
    });
    act(() => {
      older.result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(1);
    });
    client.dispose();
    const nextClient = remoteClient();
    const nextCache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const newer = renderAction(nextClient, nextCache);
    await waitFor(() => {
      expect(newer.result.current.detail.data?.thread.state).toBe('inbox');
    });
    act(() => {
      newer.result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'markUnread' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(2);
    });
    hung.open();
    await waitFor(() => {
      expect(nextCache.isMutating() + queryClient.isMutating()).toBe(0);
    });
    nextClient.dispose();
    nextCache.clear();
  });

  it('keeps detail fetched during an action that then fails', async () => {
    const failure = gate();
    let summary: string | null = null;
    server.handle('threads.get', () => ({
      body: serverDetail(stored, [], summary === null ? {} : { aiSummary: summary }),
    }));
    server.handle('threads.action', () => ({
      holdUntil: failure.wait(),
      status: 500,
      body: FAILURE,
    }));
    const { result } = renderAction();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(1);
    });
    summary = 'Peter posiela faktúru';
    act(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread(THREAD_ID) });
    });
    await waitFor(() => {
      expect(result.current.detail.data?.aiSummary).toBe('Peter posiela faktúru');
    });
    failure.open();
    await settled();
    expect(result.current.detail.data?.aiSummary).toBe('Peter posiela faktúru');
    expect(result.current.detail.data?.thread.state).toBe('inbox');
  });

  it('loads the detail again when an action cancelled its first fetch', async () => {
    const first = gate();
    let reads = 0;
    server.handle('threads.get', () => {
      reads += 1;
      return { holdUntil: reads === 1 ? first.wait() : undefined, body: serverDetail(stored, []) };
    });
    server.handle('threads.action', () => {
      stored = { ...stored, state: 'done' };
      return { body: stored };
    });
    const { result } = renderAction();
    await waitFor(() => {
      expect(count('threads.get')).toBe(1);
    });
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
    });
    await waitFor(() => {
      expect(count('threads.action')).toBe(1);
    });
    first.open();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('done');
    });
  });
});
