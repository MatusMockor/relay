import { ServerSearchResponseSchema, ThreadIdSchema } from '@relay/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';

const NOW = new Date(2026, 10, 19, 9, 41);
const DPH_09 = ThreadIdSchema.parse('ar-dph-09');

describe('demo search', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers the server search after a delay with older threads it then keeps', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const client = createDemoMailClient({ now: () => NOW, serverSearch: { delayMs: 500 } });
    let settled = false;
    const answer = client.searchServer({ requestId: 'r1', q: 'dph' }).then((response) => {
      settled = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const response = ServerSearchResponseSchema.parse(await answer);
    expect(response.requestId).toBe('r1');
    expect(response.status).toBe('ok');
    expect(response.hits.map((hit) => hit.thread.subject)).toEqual(['DPH 09/2025', 'DPH 08/2025']);
    expect(response.hits.every((hit) => hit.thread.lastMessageAt.startsWith('2025'))).toBe(true);
    expect((await client.getThread(DPH_09)).thread.subject).toBe('DPH 09/2025');
  });

  it('applies the field and account filters and reports offline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let offline = false;
    const client = createDemoMailClient({
      now: () => NOW,
      serverSearch: { delayMs: 0, offline: () => offline },
    });
    const run = async (request: Parameters<typeof client.searchServer>[0]) => {
      const answer = client.searchServer(request);
      await vi.advanceTimersByTimeAsync(0);
      return answer;
    };

    expect((await run({ requestId: 'a', q: 'Hollá', searchField: 'subject' })).hits).toEqual([]);
    expect((await run({ requestId: 'b', q: 'Hollá', searchField: 'from' })).hits).toHaveLength(2);
    expect(
      (await run({ requestId: 'c', q: 'release', accountId: buildDemoState(NOW).accounts[0]?.id }))
        .hits,
    ).toHaveLength(1);
    offline = true;
    expect(await run({ requestId: 'd', q: 'dph' })).toEqual({
      requestId: 'd',
      status: 'offline',
      hits: [],
    });
  });

  it('filters local threads everywhere, by field and by unread', async () => {
    const client = createDemoMailClient({ now: () => NOW });
    const subjects = async (params: Parameters<typeof client.listThreads>[0]) =>
      (await client.listThreads(params)).items.map((thread) => thread.subject);

    expect(await subjects({ view: 'sent', q: 'DPH' })).toEqual([]);
    expect(await subjects({ view: 'sent', q: 'DPH', everywhere: true })).toEqual([
      'Podklady k DPH za október',
    ]);
    expect(await subjects({ view: 'inbox', q: 'Hollá', searchField: 'subject' })).toEqual([]);
    expect(await subjects({ view: 'inbox', q: 'Hollá', searchField: 'from' })).toEqual([
      'Podklady k DPH za október',
    ]);
    const unread = (await client.listThreads({ view: 'inbox', everywhere: true, unread: true }))
      .items;
    expect(unread.length).toBeGreaterThan(0);
    expect(unread.every((thread) => thread.unread)).toBe(true);
    expect(await subjects({ view: 'inbox', q: 'DPH', hasAttachment: true })).toEqual([]);
  });
});
