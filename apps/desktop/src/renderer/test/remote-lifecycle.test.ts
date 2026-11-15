import type { AiEvent } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RealtimeConnection } from '../src/data/remote/RealtimeConnection';
import { RemoteAiRuns } from '../src/data/remote/RemoteAiRuns';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

const EXPIRED = '2000-01-01T00:00:00.000Z';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (check: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < 3_000) {
    await pause(10);
  }
  expect(check()).toBe(true);
};

const QUEUED_JOB = {
  id: 'job-1',
  userId: 'user-1',
  kind: 'chatAnswer',
  status: 'queued',
  runnerLocation: 'server',
  runner: 'claude',
  input: { kind: 'chatAnswer', question: 'Čo dnes?', threadId: null, history: [] },
  output: null,
  error: null,
  createdAt: '2026-11-15T08:00:00.000Z',
  updatedAt: '2026-11-15T08:00:00.000Z',
};

describe('remote session lifecycle', () => {
  let server: ContractServer;
  let store: MemoryTokenStore;

  beforeEach(async () => {
    server = await startContractServer();
    store = new MemoryTokenStore();
  });

  afterEach(async () => {
    await server.close();
  });

  const sessionWith = (onSessionExpired?: () => void) =>
    new RendererTokenSession({ baseUrl: server.url, tokens: store, onSessionExpired });

  it('does not bring back tokens that were cleared while a refresh was running', async () => {
    await store.save(tokens('access-1', 'refresh-1', EXPIRED));
    server.handle('auth.refresh', () => ({ delayMs: 80, body: tokens('access-2') }));
    const session = sessionWith();
    const pending = session.accessToken();
    await pause(20);
    await session.clear();
    expect(await pending).toBeNull();
    expect(await store.load()).toBeNull();
  });

  it('keeps a newer login when an older refresh is rejected', async () => {
    await store.save(tokens('access-1', 'refresh-1', EXPIRED));
    server.handle('auth.refresh', () => ({
      delayMs: 80,
      status: 401,
      body: { error: { code: 'unauthorized', message: 'Neplatný token' } },
    }));
    const expired: string[] = [];
    const session = sessionWith(() => expired.push('expired'));
    const pending = session.accessToken();
    await pause(20);
    await session.save(tokens('access-new'));
    expect(await pending).toBe('access-new');
    expect((await store.load())?.accessToken).toBe('access-new');
    expect(expired).toEqual([]);
  });

  it('retries the realtime connection when reading the token fails', async () => {
    let calls = 0;
    const connection = new RealtimeConnection({
      baseUrl: server.url,
      accessToken: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('IPC zlyhalo')) : Promise.resolve('access-1');
      },
      renewToken: () => Promise.resolve(null),
      onEvent: () => undefined,
      minDelayMs: 10,
    });
    connection.start();
    await waitUntil(() => server.sockets.length === 1);
    connection.stop();
    expect(calls).toBe(2);
  });

  it('drops an AI job that was still being created when all runs stopped', async () => {
    await store.save(tokens('access-1'));
    server.handle('ai.createJob', () => ({ delayMs: 60, body: QUEUED_JOB }));
    const runs = new RemoteAiRuns(new HttpApi({ baseUrl: server.url, session: sessionWith() }));
    const events: AiEvent[] = [];
    runs.start(
      { input: { kind: 'chatAnswer', question: 'Čo dnes?', threadId: null, history: [] } },
      (event) => events.push(event),
    );
    runs.stopAll();
    await waitUntil(() => server.requests.some((request) => request.key === 'ai.createJob'));
    await pause(150);
    expect(events).toEqual([]);
  });
});
