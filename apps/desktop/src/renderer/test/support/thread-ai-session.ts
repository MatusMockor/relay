import { type AiJob, AiJobSchema, type ThreadSummary } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createBrowserPlatform } from '../../src/platform/BrowserPlatform';
import type { ContractServer } from './contract-server';
import { tokens } from './fixtures';
import { renderApp, storageWith } from './render-app';

export const AI_STAMP = '2026-11-15T08:05:00.000Z';

export type ThreadAiJobKind = 'summary' | 'replySuggestions';

export const jobOf = (kind: ThreadAiJobKind, threadId: string, status: AiJob['status']): AiJob =>
  AiJobSchema.parse({
    id: `job-${kind}`,
    userId: 'user-1',
    kind,
    status,
    runnerLocation: 'server',
    runner: 'claude',
    input: { kind, threadId },
    output: null,
    error: null,
    createdAt: AI_STAMP,
    updatedAt: AI_STAMP,
  });

export const refOf = (kind: ThreadAiJobKind) => ({ kind, jobId: `job-${kind}` });

export const welcomeOnHello = (server: ContractServer): void => {
  server.onSocketMessage((socket, text) => {
    const message = JSON.parse(text) as { type: string };
    if (message.type === 'hello') {
      socket.send(JSON.stringify({ type: 'welcome', userId: 'user-1', deviceId: 'device-1' }));
    }
  });
};

export const requestCount = (server: ContractServer, key: string): number =>
  server.requests.filter((request) => request.key === key).length;

export const pushJob = (server: ContractServer, job: AiJob): void => {
  server.sockets[0]?.send(
    JSON.stringify({
      type: 'event',
      event: { type: 'ai.job.updated', at: AI_STAMP, data: { job } },
    }),
  );
};

export const settle = async (server: ContractServer): Promise<void> => {
  let seen = -1;
  while (seen !== server.requests.length) {
    seen = server.requests.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
  }
};

export const openFirstThread = async (
  server: ContractServer,
  threads: readonly ThreadSummary[],
): Promise<HTMLElement> => {
  server.handle('threads.list', () => ({ body: { items: threads, nextCursor: null } }));
  const platform = createBrowserPlatform(
    storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
  );
  await platform.tokenStore(server.url).save(tokens('access-1'));
  renderApp({ platform });
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  await waitFor(() => {
    expect(server.sockets[0]?.messages.length).toBeGreaterThan(0);
  });
  await settle(server);
  act(() => {
    fireEvent.click(within(list).getAllByRole('option')[0] ?? document.body);
  });
  return list;
};
