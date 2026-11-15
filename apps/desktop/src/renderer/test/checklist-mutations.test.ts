import { ThreadIdSchema } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { ChecklistMutations } from '../src/features/thread/checklist-mutations';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

interface Exchange {
  readonly url: string;
  readonly done: boolean;
  readonly arrivedAt: number;
}

const THREAD_A = ThreadIdSchema.parse('thread-a');
const THREAD_B = ThreadIdSchema.parse('thread-b');
const item = (done: boolean) => ({ id: 'c1', text: 'Prejsť checklist', done });

const waitUntil = async (check: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!check() && Date.now() - started < 3_000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(check()).toBe(true);
};

describe('checklist mutations', () => {
  let server: ContractServer;
  let client: MailClient;
  let stored: Map<string, boolean>;
  let exchanges: Exchange[];

  beforeEach(async () => {
    server = await startContractServer();
    stored = new Map();
    exchanges = [];
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
    });
  });

  afterEach(async () => {
    client.dispose();
    await server.close();
  });

  const serve = (failFirstOf: string | null) => {
    server.handle('threads.updateChecklist', (request) => {
      const { done } = request.body as { done: boolean };
      exchanges.push({ url: request.url, done, arrivedAt: Date.now() });
      const first = exchanges.filter((entry) => entry.url === request.url).length === 1;
      if (first && request.url === failFirstOf) {
        return { status: 500, delayMs: 60, body: { error: { code: 'internal', message: 'x' } } };
      }
      stored.set(request.url, done);
      return { delayMs: 30, body: { checklist: [{ ...item(done) }] } };
    });
  };

  it('sends ticks of one item one after another and keeps the last value', async () => {
    serve(null);
    const mutations = new ChecklistMutations(client);
    const rollbacks: boolean[] = [];
    const rollback = (saved: boolean) => rollbacks.push(saved);
    mutations.toggle(THREAD_A, item(false), rollback);
    mutations.toggle(THREAD_A, item(true), rollback);
    mutations.toggle(THREAD_A, item(false), rollback);
    await waitUntil(() => mutations.size === 0);
    expect(exchanges.map((entry) => entry.done)).toEqual([true, false, true]);
    exchanges.slice(1).forEach((entry, index) => {
      expect(entry.arrivedAt - (exchanges[index]?.arrivedAt ?? 0)).toBeGreaterThanOrEqual(25);
    });
    expect(stored.get('/threads/thread-a/checklist')).toBe(true);
    expect(rollbacks).toEqual([]);
  });

  it('keeps items with the same id in different threads apart', async () => {
    serve('/threads/thread-b/checklist');
    const mutations = new ChecklistMutations(client);
    const rollbacks: { thread: string; saved: boolean }[] = [];
    mutations.toggle(THREAD_A, item(false), (saved) => rollbacks.push({ thread: 'a', saved }));
    mutations.toggle(THREAD_B, item(true), (saved) => rollbacks.push({ thread: 'b', saved }));
    await waitUntil(() => mutations.size === 0);
    expect(rollbacks).toEqual([{ thread: 'b', saved: true }]);
    expect(stored.get('/threads/thread-a/checklist')).toBe(true);
    expect(stored.has('/threads/thread-b/checklist')).toBe(false);
  });

  it('rolls back a failure to the last saved value only when it is the latest tick', async () => {
    serve('/threads/thread-a/checklist');
    const mutations = new ChecklistMutations(client);
    const rollbacks: boolean[] = [];
    mutations.toggle(THREAD_A, item(false), (saved) => rollbacks.push(saved));
    mutations.toggle(THREAD_A, item(true), (saved) => rollbacks.push(saved));
    await waitUntil(() => mutations.size === 0);
    expect(rollbacks).toEqual([]);
    expect(stored.get('/threads/thread-a/checklist')).toBe(false);
    serve('/threads/thread-a/checklist');
    exchanges = [];
    mutations.toggle(THREAD_A, item(false), (saved) => rollbacks.push(saved));
    await waitUntil(() => mutations.size === 0);
    expect(rollbacks).toEqual([false]);
  });
});
