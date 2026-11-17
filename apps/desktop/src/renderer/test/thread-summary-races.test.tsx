// @vitest-environment jsdom
import { type ThreadDetail, type ThreadSummary } from '@relay/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '../src/data/hooks/query-keys';
import { type ContractServer, startContractServer } from './support/contract-server';
import { resetStores, testQueryClient } from './support/render-app';
import {
  AI_STAMP,
  jobOf,
  openFirstThread,
  pushJob,
  refOf,
  requestCount,
  settle,
  welcomeOnHello,
} from './support/thread-ai-session';
import { serverDetail, serverThread } from './support/thread-fixtures';

const SUMMARY = 'Jana posiela zmluvu na podpis.';
const WAITING = 'AI pripravuje zhrnutie…';

const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe('a requested thread summary stays pending', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    welcomeOnHello(server);
    server.handle('threads.prepareAi', () => ({ body: { pending: [] } }));
    server.handle('threads.requestSummary', () => ({
      body: { pending: ['summary'], jobs: [refOf('summary')] },
    }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const serveDetail = (thread: ThreadSummary) => {
    const holder: { detail: ThreadDetail } = { detail: serverDetail(thread, []) };
    server.handle('threads.get', () => ({ body: holder.detail }));
    server.handle('ai.getJob', () => ({ body: jobOf('summary', thread.id, 'running') }));
    return holder;
  };

  const askForSummary = async () => {
    const ask = await screen.findByRole('button', { name: 'Zhrnúť vlákno' });
    act(() => {
      ask.click();
    });
    expect(await screen.findByText(WAITING)).toBeDefined();
  };

  const expectStillWaiting = async () => {
    await settle(server);
    expect(screen.getByText(WAITING)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Zhrnúť vlákno' })).toBeNull();
  };

  const finish = (served: { detail: ThreadDetail }, thread: ThreadSummary) => {
    served.detail = serverDetail(thread, [], { aiSummary: SUMMARY });
    act(() => {
      pushJob(server, jobOf('summary', thread.id, 'done'));
    });
    return screen.findByText(SUMMARY);
  };

  it('survives a prepare response that arrives after the request', async () => {
    server.handle('threads.prepareAi', () => ({ body: { pending: [] }, delayMs: 400 }));
    const thread = serverThread('Neskorá odpoveď');
    const served = serveDetail(thread);

    await openFirstThread(server, [thread]);
    await askForSummary();
    expect(requestCount(server, 'threads.prepareAi')).toBe(1);
    await pause(600);

    await expectStillWaiting();
    expect(await finish(served, thread)).toBeDefined();
  });

  it('survives new mail that changes the thread while the job runs', async () => {
    const thread = serverThread('Nová pošta');
    const served = serveDetail(thread);

    await openFirstThread(server, [thread]);
    await askForSummary();
    const moved = { ...thread, lastMessageAt: '2026-11-15T09:00:00.000Z', messageCount: 2 };
    served.detail = serverDetail(moved, []);
    act(() => {
      server.sockets[0]?.send(
        JSON.stringify({
          type: 'event',
          event: { type: 'thread.upserted', at: AI_STAMP, data: { thread: moved } },
        }),
      );
    });
    await waitFor(() => {
      expect(requestCount(server, 'threads.prepareAi')).toBe(2);
    });

    await expectStillWaiting();
    expect(await finish(served, moved)).toBeDefined();
  });

  it('survives a refetch of the thread AI state while the job runs', async () => {
    const queryClient = testQueryClient();
    const thread = serverThread('Obnovenie');
    const served = serveDetail(thread);

    await openFirstThread(server, [thread], queryClient);
    await askForSummary();
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.threadAiAll() }));
    expect(requestCount(server, 'threads.prepareAi')).toBe(2);

    await expectStillWaiting();
    expect(await finish(served, thread)).toBeDefined();
  });
});
