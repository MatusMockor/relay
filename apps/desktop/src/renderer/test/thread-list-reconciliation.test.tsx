// @vitest-environment jsdom
import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { act, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoState } from '../src/data/demo/demo-state';
import { demoIds } from '../src/data/demo/seed/ids';
import type { ThreadListParams } from '../src/data/MailClient';
import { useUiStore } from '../src/state/ui-store';
import { bulkThread } from './support/bulk-demo-threads';
import { scrollElementOf, scrollListTo, scrollListToEnd } from './support/list-scroll';
import {
  emitRemoval,
  emitUpsert,
  loadAllPagesOf,
  loadPagesOf,
  pageOf,
  startPagedList,
} from './support/paged-list';
import { resetStores } from './support/render-app';

const NOW = new Date(2026, 10, 19, 12, 0);
const LABEL = demoIds.label('bulk-projekt');
const LABEL_VIEW: ThreadListParams = { view: 'label', labelId: LABEL };
const INBOX: ThreadListParams = { view: 'inbox' };

const summaryOf = (state: DemoState, index: number): ThreadSummary => {
  const summary = state.threads.get(bulkThread(index, NOW).id)?.summary;
  expect(summary).toBeDefined();
  return summary ?? bulkThread(index, NOW);
};

const relabel = (state: DemoState, index: number, labelIds: ThreadSummary['labelIds']) => {
  const record = state.threads.get(bulkThread(index, NOW).id);
  expect(record).toBeDefined();
  if (record === undefined) {
    return bulkThread(index, NOW);
  }
  record.summary = { ...record.summary, labelIds };
  return record.summary;
};

const labelEveryOther = (state: DemoState): void => {
  for (let index = 0; index < 1_200; index += 2) {
    relabel(state, index, [LABEL]);
  }
};

const idsOf = (page: ThreadPage | undefined): string[] =>
  (page?.items ?? []).map((item) => item.id);

const startLabelView = async () => {
  const started = await startPagedList({
    now: NOW,
    threads: 1_500,
    folder: { kind: 'label', labelId: LABEL },
    prepare: labelEveryOther,
  });
  const loaded = () => pageOf(started.queryClient, LABEL_VIEW);
  await loadAllPagesOf(started.listbox, loaded);
  return { ...started, loaded };
};

const gatedPages = () => {
  const gates: (() => void)[] = [];
  const release = () => {
    gates.splice(0).forEach((open) => {
      open();
    });
  };
  const gate = <T,>(value: T): Promise<T> =>
    new Promise((resolve) => {
      gates.push(() => {
        resolve(value);
      });
    });
  return { gate, release, pending: () => gates.length };
};

const waitForIdle = async (queryClient: QueryClient) => {
  await waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
  });
};

describe('thread list reconciliation with loaded pages', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    resetStores();
  });
  afterEach(() => {
    resetStores();
    vi.useRealTimers();
  });

  it('lists a thread that got the label deep inside a fully loaded label view', async () => {
    const { state, queryClient, loaded } = await startLabelView();
    expect(loaded()?.items).toHaveLength(600);
    expect(loaded()?.nextCursor).toBeNull();
    emitUpsert(queryClient, relabel(state, 601, [LABEL]), NOW);

    await waitFor(() => {
      expect(idsOf(loaded())).toContain(bulkThread(601, NOW).id);
    });
    expect(idsOf(loaded()).indexOf(bulkThread(601, NOW).id)).toBe(301);
    expect(loaded()?.items).toHaveLength(601);
    expect(loaded()?.nextCursor).toBeNull();
  });

  it('drops a loaded thread at once when its label is removed', async () => {
    const { state, queryClient, loaded } = await startLabelView();
    const unlabelled = bulkThread(900, NOW).id;
    expect(idsOf(loaded()).indexOf(unlabelled)).toBe(450);
    emitUpsert(queryClient, relabel(state, 900, []), NOW);

    expect(idsOf(loaded())).not.toContain(unlabelled);
    await waitForIdle(queryClient);
    expect(idsOf(loaded())).not.toContain(unlabelled);
    expect(loaded()?.items).toHaveLength(599);
  });

  it('never brings back a thread removed while its page was loading', async () => {
    const pages = gatedPages();
    const { state, queryClient, listbox } = await startPagedList({
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
    const removed = summaryOf(state, 250);
    emitRemoval(queryClient, state, removed, NOW);
    act(() => {
      pages.release();
    });

    await waitFor(() => {
      expect(loaded()?.items.length).toBeGreaterThan(200);
    });
    expect(idsOf(loaded())).not.toContain(removed.id);
    emitUpsert(queryClient, summaryOf(state, 0), NOW);
    await waitFor(() => {
      expect(pages.pending()).toBe(1);
    });
    act(() => {
      pages.release();
    });
    await waitForIdle(queryClient);
    expect(idsOf(loaded())).not.toContain(removed.id);
    expect(new Set(idsOf(loaded())).size).toBe(loaded()?.items.length);
  });

  it('moves the selection to the next thread and reveals it when the selected one is removed', async () => {
    const { state, queryClient, listbox } = await startPagedList({ now: NOW, threads: 1_000 });
    const loaded = () => pageOf(queryClient, INBOX);
    await loadPagesOf(listbox, loaded, 3);
    const items = loaded()?.items ?? [];
    const selected = items[450];
    const next = items[451];
    expect(selected).toBeDefined();
    expect(next).toBeDefined();
    if (selected === undefined || next === undefined) {
      return;
    }
    act(() => {
      useUiStore.setState({ selected: { 'inbox:main': selected.id } });
    });
    await waitFor(() => {
      expect(listbox.querySelector('.a-row.sel')).not.toBeNull();
    });
    scrollListTo(listbox, 0);
    await waitFor(() => {
      expect(listbox.querySelector('.a-row.sel')).toBeNull();
    });
    emitRemoval(queryClient, state, selected, NOW);

    await waitFor(() => {
      expect(useUiStore.getState().selected['inbox:main']).toBe(next.id);
    });
    await waitFor(() => {
      const row = listbox.querySelector('.a-row.sel');
      expect(row?.textContent).toContain(next.subject);
    });
    expect(scrollElementOf(listbox).scrollTop).toBeGreaterThan(0);
  });
});
