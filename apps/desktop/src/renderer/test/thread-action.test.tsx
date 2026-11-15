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
import { serverDetail, serverThread } from './support/thread-fixtures';

const THREAD_ID = ThreadIdSchema.parse('thread-1');
const FAILURE = { error: { code: 'internal', message: 'Server neodpovedá' } };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('thread actions on the detail cache', () => {
  let server: ContractServer;
  let client: MailClient;
  let queryClient: QueryClient;
  let stored: ThreadSummary;

  beforeEach(async () => {
    server = await startContractServer();
    stored = serverThread('Faktúra za október');
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(async () => {
    cleanup();
    client.dispose();
    queryClient.clear();
    await server.close();
  });

  const renderAction = () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ServicesProvider
          services={{ mode: 'synced', client, server: null, serverUrl: server.url }}
        >
          {children}
        </ServicesProvider>
      </QueryClientProvider>
    );
    return renderHook(() => ({ detail: useThreadDetail(THREAD_ID), action: useThreadAction() }), {
      wrapper,
    });
  };

  it('does not let an older detail response undo the action', async () => {
    let delayMs = 0;
    server.handle('threads.get', () => ({ delayMs, body: serverDetail(stored, []) }));
    server.handle('threads.action', () => {
      stored = { ...stored, state: 'done' };
      return { delayMs: 20, body: stored };
    });
    const { result } = renderAction();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    delayMs = 150;
    act(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread(THREAD_ID) });
    });
    await pause(20);
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
    });
    await pause(250);
    expect(result.current.detail.data?.thread.state).toBe('done');
  });

  it('returns to the server state when two overlapping actions both fail', async () => {
    server.handle('threads.get', () => ({ body: serverDetail(stored, []) }));
    server.handle('threads.action', () => ({ delayMs: 40, status: 500, body: FAILURE }));
    const { result } = renderAction();
    await waitFor(() => {
      expect(result.current.detail.data?.thread.state).toBe('inbox');
    });
    act(() => {
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'done' } });
      result.current.action.mutate({ threadId: THREAD_ID, action: { type: 'markUnread' } });
    });
    await waitFor(() => {
      expect(server.requests.filter((request) => request.key === 'threads.action')).toHaveLength(2);
    });
    await pause(150);
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
    await pause(400);
    expect(result.current.detail.data?.thread.unread).toBe(true);
    expect(result.current.detail.data?.thread.state).toBe('inbox');
  });
});
