import { describe, expect, it } from 'vitest';
import { fetchThreadRange, RANGE_PAGE_LIMIT, rangeTargetOf } from '../src/data/hooks/thread-range';
import { threadListParams } from '../src/data/hooks/use-mail-queries';
import {
  addDemoThread,
  bulkDemoState,
  bulkThread,
  countingListClient,
} from './support/bulk-demo-threads';

const NOW = new Date(2026, 10, 19, 12, 0);
const INBOX = threadListParams({ view: 'inbox' });

const setup = (threads: number) => {
  const state = bulkDemoState(threads, NOW);
  return { state, counting: countingListClient(state, () => NOW) };
};

describe('fetchThreadRange', () => {
  it('reads only the head page when nothing is loaded yet', async () => {
    const { counting } = setup(1_000);
    const range = await fetchThreadRange(counting.client, { params: INBOX, loaded: () => 0 });

    expect(range.items).toHaveLength(200);
    expect(range.nextCursor).not.toBeNull();
    expect(counting.listCalls).toHaveLength(1);
  });

  it('re-reads every page of a fully loaded list so a thread that joined mid-range is listed', async () => {
    const { state, counting } = setup(600);
    const everything = { params: INBOX, loaded: () => Number.POSITIVE_INFINITY };
    const before = await fetchThreadRange(counting.client, everything);
    const joined = { ...bulkThread(300, NOW), id: bulkThread(-7, NOW).id, subject: 'Vrátená' };
    addDemoThread(state, joined);
    counting.listCalls.splice(0);
    const range = await fetchThreadRange(counting.client, everything);

    expect(range.items).toHaveLength(before.items.length + 1);
    expect(range.items.findIndex((item) => item.id === joined.id)).toBeGreaterThan(290);
    expect(range.nextCursor).toBeNull();
    expect(counting.listCalls.map((call) => call.cursor)).toEqual([undefined, '200', '400', '600']);
  });

  it('stops once the loaded count is covered and keeps the cursor of the last page', async () => {
    const { counting } = setup(1_000);
    const range = await fetchThreadRange(counting.client, { params: INBOX, loaded: () => 400 });

    expect(range.items).toHaveLength(400);
    expect(range.nextCursor).toBe('400');
  });

  it('follows pages that were appended while the range was being read', async () => {
    const { counting } = setup(1_000);
    const loaded = [400, 600];
    const range = await fetchThreadRange(counting.client, {
      params: INBOX,
      loaded: () => loaded.shift() ?? 600,
    });

    expect(range.items).toHaveLength(600);
    expect(range.nextCursor).toBe('600');
    expect(counting.listCalls).toHaveLength(3);
  });

  it('stops reading further pages once the request is aborted', async () => {
    const { counting } = setup(1_000);
    const controller = new AbortController();
    controller.abort();
    await fetchThreadRange(counting.client, {
      params: INBOX,
      loaded: () => 1_000,
      signal: controller.signal,
    });

    expect(counting.listCalls).toHaveLength(1);
  });

  it('bounds a refetch to a fixed number of pages', async () => {
    const { counting } = setup(200 * (RANGE_PAGE_LIMIT + 2));
    const range = await fetchThreadRange(counting.client, {
      params: INBOX,
      loaded: () => Number.POSITIVE_INFINITY,
    });

    expect(counting.listCalls).toHaveLength(RANGE_PAGE_LIMIT);
    expect(range.items).toHaveLength(200 * RANGE_PAGE_LIMIT);
    expect(range.nextCursor).not.toBeNull();
  });
});

describe('rangeTargetOf', () => {
  it('reads nothing beyond the head for an empty cache', () => {
    expect(rangeTargetOf(undefined)).toBe(0);
  });

  it('covers the loaded threads of a partial list and the whole of a complete one', () => {
    const items = [bulkThread(0, NOW), bulkThread(1, NOW)];
    expect(rangeTargetOf({ items, nextCursor: '2' })).toBe(2);
    expect(rangeTargetOf({ items, nextCursor: null })).toBe(Number.POSITIVE_INFINITY);
  });
});
