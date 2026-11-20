import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { act, waitFor } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { expect } from 'vitest';
import type { DemoState } from '../../src/data/demo/demo-state';
import { queryKeys } from '../../src/data/hooks/query-keys';
import { applyRealtimeEvent } from '../../src/data/hooks/realtime-cache';
import { threadListParams } from '../../src/data/hooks/use-mail-queries';
import type { MailClient, ThreadListParams } from '../../src/data/MailClient';
import type { Folder } from '../../src/state/folders';
import { useUiStore } from '../../src/state/ui-store';
import { bulkDemoState, type CountingClient, countingListClient } from './bulk-demo-threads';
import { scrollListToEnd, threadListbox, waitForRows } from './list-scroll';
import { renderApp, testQueryClient } from './render-app';

export interface PagedListOptions {
  readonly now: Date;
  readonly threads: number;
  readonly folder?: Folder;
  readonly prepare?: (state: DemoState) => void;
  readonly client?: (counting: CountingClient) => MailClient;
}

export const pageOf = (
  queryClient: QueryClient,
  params: ThreadListParams,
): ThreadPage | undefined =>
  queryClient.getQueryData<ThreadPage>(queryKeys.threadList(threadListParams(params)));

export const startPagedList = async (options: PagedListOptions) => {
  const state = bulkDemoState(options.threads, options.now);
  options.prepare?.(state);
  const counting = countingListClient(state, () => options.now);
  const queryClient = testQueryClient();
  useUiStore.setState({ rightOpen: false, ...(options.folder ? { folder: options.folder } : {}) });
  renderApp({ demo: () => options.client?.(counting) ?? counting.client, queryClient });
  const listbox = await threadListbox();
  await waitForRows();
  return { state, counting, queryClient, listbox };
};

export const loadPagesOf = async (
  listbox: HTMLElement,
  loaded: () => ThreadPage | undefined,
  pages: number,
): Promise<void> => {
  for (let page = 1; page < pages; page += 1) {
    const before = loaded()?.items.length ?? 0;
    scrollListToEnd(listbox);
    await waitFor(() => {
      expect(loaded()?.items.length ?? 0).toBeGreaterThan(before);
    });
  }
};

export const loadAllPagesOf = async (
  listbox: HTMLElement,
  loaded: () => ThreadPage | undefined,
): Promise<void> => {
  while (loaded()?.nextCursor !== null) {
    await loadPagesOf(listbox, loaded, 2);
  }
};

export const emitUpsert = (queryClient: QueryClient, thread: ThreadSummary, at: Date): void => {
  act(() => {
    applyRealtimeEvent(queryClient, {
      type: 'thread.upserted',
      at: at.toISOString(),
      data: { thread },
    });
  });
};

export const emitRemoval = (
  queryClient: QueryClient,
  state: DemoState,
  thread: ThreadSummary,
  at: Date,
): void => {
  expect(state.threads.delete(thread.id)).toBe(true);
  act(() => {
    applyRealtimeEvent(queryClient, {
      type: 'thread.removed',
      at: at.toISOString(),
      data: { threadId: thread.id, accountId: thread.accountId },
    });
  });
};

export const idsOf = (page: ThreadPage | undefined): string[] =>
  (page?.items ?? []).map((item) => item.id);

export const gatedPages = () => {
  const gates: (() => void)[] = [];
  const release = () => {
    gates.splice(0).forEach((open) => {
      open();
    });
  };
  const gate = <T>(value: T): Promise<T> =>
    new Promise((resolve) => {
      gates.push(() => {
        resolve(value);
      });
    });
  return { gate, release, pending: () => gates.length };
};

export const waitForIdle = async (queryClient: QueryClient): Promise<void> => {
  await waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
  });
};
