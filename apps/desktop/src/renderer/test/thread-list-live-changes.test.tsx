// @vitest-environment jsdom
import type { ThreadSummary } from '@relay/shared';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoState } from '../src/data/demo/demo-state';
import type { ThreadListParams } from '../src/data/MailClient';
import { useUiStore } from '../src/state/ui-store';
import { addDemoThread, bulkThread } from './support/bulk-demo-threads';
import { scrollListToEnd } from './support/list-scroll';
import {
  emitUpsert,
  gatedPages,
  idsOf,
  loadPagesOf,
  pageOf,
  startPagedList,
  waitForIdle,
} from './support/paged-list';
import { resetStores } from './support/render-app';

const NOW = new Date(2026, 10, 19, 12, 0);
const INBOX: ThreadListParams = { view: 'inbox' };

const archive = (state: DemoState, index: number): ThreadSummary => {
  const record = state.threads.get(bulkThread(index, NOW).id);
  expect(record).toBeDefined();
  if (record === undefined) {
    return bulkThread(index, NOW);
  }
  record.summary = { ...record.summary, state: 'done' };
  return record.summary;
};

describe('thread list pages racing live changes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    resetStores();
  });
  afterEach(() => {
    resetStores();
    vi.useRealTimers();
  });

  it('never appends a thread that was archived while its page was loading', async () => {
    const pages = gatedPages();
    const { state, counting, queryClient, listbox } = await startPagedList({
      now: NOW,
      threads: 1_000,
      client: (counting) => ({
        ...counting.client,
        listThreads: async (params) => {
          const page = await counting.client.listThreads(params);
          return params.cursor === undefined ? page : pages.gate(page);
        },
      }),
    });
    const loaded = () => pageOf(queryClient, INBOX);
    scrollListToEnd(listbox);
    await waitFor(() => {
      expect(pages.pending()).toBe(1);
    });
    const heads = counting.listCalls.filter((call) => call.cursor === undefined).length;
    const archived = archive(state, 250);
    emitUpsert(queryClient, archived, NOW);
    await waitFor(() => {
      expect(counting.listCalls.filter((call) => call.cursor === undefined).length).toBeGreaterThan(
        heads,
      );
    });
    await waitForIdle(queryClient);
    act(() => {
      pages.release();
    });

    await waitFor(() => {
      expect(loaded()?.items.length).toBeGreaterThan(200);
    });
    expect(idsOf(loaded())).not.toContain(archived.id);
  });

  it('keeps the selection on a loaded thread that new mail pushed past the loaded count', async () => {
    const { state, queryClient, listbox } = await startPagedList({ now: NOW, threads: 1_000 });
    const loaded = () => pageOf(queryClient, INBOX);
    await loadPagesOf(listbox, loaded, 2);
    expect(loaded()?.items).toHaveLength(400);
    const selected = loaded()?.items[300];
    expect(selected).toBeDefined();
    if (selected === undefined) {
      return;
    }
    act(() => {
      useUiStore.setState({ selected: { 'inbox:main': selected.id } });
    });
    const fresh = Array.from({ length: 120 }, (_, index) => ({
      ...bulkThread(-1 - index, NOW),
      subject: `Nová pošta ${String(index)}`,
    }));
    fresh.forEach((thread) => {
      addDemoThread(state, thread);
    });
    emitUpsert(queryClient, fresh[0] ?? bulkThread(-1, NOW), NOW);

    await waitFor(() => {
      expect(idsOf(loaded())[0]).toBe(bulkThread(-120, NOW).id);
    });
    await waitForIdle(queryClient);
    expect(idsOf(loaded())).toContain(selected.id);
    expect(useUiStore.getState().selected['inbox:main']).toBe(selected.id);
  });
});
