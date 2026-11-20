import type { ThreadPage } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { fetchThreadRange, RANGE_PAGE_LIMIT } from '../src/data/hooks/thread-range';
import { threadListParams } from '../src/data/hooks/use-mail-queries';
import {
  addDemoThread,
  bulkDemoState,
  bulkThread,
  type CountingClient,
  countingListClient,
} from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const INBOX = threadListParams({ view: 'inbox' });

const setup = (threads: number) => {
  const state = bulkDemoState(threads, NOW);
  return { state, counting: countingListClient(state, () => NOW) };
};

const cachedHead = async (counting: CountingClient, loaded: number): Promise<ThreadPage> => {
  const page = await counting.client.listThreads({ ...INBOX, limit: loaded });
  counting.listCalls.splice(0);
  return page;
};

const ids = (page: ThreadPage): string[] => page.items.map((item) => item.id);

describe('fetchThreadRange', () => {
  it('reads only the head page when nothing is loaded yet', async () => {
    const { counting } = setup(1_000);
    const range = await fetchThreadRange(counting.client, {
      params: INBOX,
      cached: () => undefined,
    });

    expect(range.items).toHaveLength(200);
    expect(range.nextCursor).not.toBeNull();
    expect(counting.listCalls).toHaveLength(1);
  });

  it('re-reads every page of a fully loaded list so a thread that joined mid-range is listed', async () => {
    const { state, counting } = setup(600);
    const before = await cachedHead(counting, 10_000);
    expect(before.nextCursor).toBeNull();
    const joined = { ...bulkThread(300, NOW), id: bulkThread(-7, NOW).id, subject: 'Vrátená' };
    addDemoThread(state, joined);
    const range = await fetchThreadRange(counting.client, { params: INBOX, cached: () => before });

    expect(range.items).toHaveLength(before.items.length + 1);
    expect(range.items.findIndex((item) => item.id === joined.id)).toBeGreaterThan(290);
    expect(range.nextCursor).toBeNull();
    expect(counting.listCalls.map((call) => call.cursor)).toEqual([undefined, '200', '400', '600']);
  });

  it('stops once the loaded threads are covered and keeps the cursor of the last page', async () => {
    const { counting } = setup(1_000);
    const cached = await cachedHead(counting, 400);
    const range = await fetchThreadRange(counting.client, { params: INBOX, cached: () => cached });

    expect(range.items).toHaveLength(400);
    expect(range.nextCursor).toBe('400');
  });

  it('keeps reading until it passes the last loaded thread after new mail shifted the list', async () => {
    const { state, counting } = setup(1_000);
    const cached = await cachedHead(counting, 400);
    addDemoThread(state, { ...bulkThread(-1, NOW), id: bulkThread(-1, NOW).id, subject: 'Nová' });
    const range = await fetchThreadRange(counting.client, { params: INBOX, cached: () => cached });

    expect(ids(range)).toEqual(expect.arrayContaining(ids(cached)));
    expect(range.items[0]?.id).toBe(bulkThread(-1, NOW).id);
    expect(range.nextCursor).toBe(String(range.items.length));
  });

  it('follows pages that were appended while the range was being read', async () => {
    const { counting } = setup(1_000);
    const first = await cachedHead(counting, 400);
    const later = await cachedHead(counting, 600);
    const cached = [first, later];
    const range = await fetchThreadRange(counting.client, {
      params: INBOX,
      cached: () => cached.shift() ?? later,
    });

    expect(range.items).toHaveLength(600);
    expect(range.nextCursor).toBe('600');
    expect(counting.listCalls).toHaveLength(3);
  });

  it('stops reading further pages once the request is aborted', async () => {
    const { counting } = setup(1_000);
    const cached = await cachedHead(counting, 1_000);
    const controller = new AbortController();
    controller.abort();
    await fetchThreadRange(counting.client, {
      params: INBOX,
      cached: () => cached,
      signal: controller.signal,
    });

    expect(counting.listCalls).toHaveLength(1);
  });

  it('bounds a refetch to a fixed number of pages and keeps the loaded tail beyond it', async () => {
    const { counting } = setup(200 * (RANGE_PAGE_LIMIT + 2));
    const cached = await cachedHead(counting, 200 * RANGE_PAGE_LIMIT + 200);
    const range = await fetchThreadRange(counting.client, { params: INBOX, cached: () => cached });

    expect(counting.listCalls).toHaveLength(RANGE_PAGE_LIMIT);
    expect(ids(range)).toEqual(ids(cached));
    expect(range.nextCursor).toBe(cached.nextCursor);
  });

  it('keeps the whole of a complete list that is longer than the refetch bound', async () => {
    const { counting } = setup(200 * (RANGE_PAGE_LIMIT + 2));
    const cached = await cachedHead(counting, 200 * (RANGE_PAGE_LIMIT + 5));
    expect(cached.nextCursor).toBeNull();
    const range = await fetchThreadRange(counting.client, { params: INBOX, cached: () => cached });

    expect(counting.listCalls).toHaveLength(RANGE_PAGE_LIMIT);
    expect(ids(range)).toEqual(ids(cached));
    expect(range.nextCursor).toBeNull();
  });
});
