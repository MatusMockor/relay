// @vitest-environment jsdom
import type { ThreadPage } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../src/data/hooks/query-keys';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { threadListParams } from '../src/data/hooks/use-mail-queries';
import type { MailClient } from '../src/data/MailClient';
import { useUiStore } from '../src/state/ui-store';
import {
  addDemoThread,
  bulkDemoState,
  bulkThread,
  type CountingClient,
  countingListClient,
} from './support/bulk-demo-threads';
import { LIST_ROW_HEIGHT } from './support/list-geometry';
import {
  scrollElementOf,
  scrollListTo,
  scrollListToEnd,
  threadListbox,
  waitForRows,
} from './support/list-scroll';

const slotTop = (slot: HTMLElement): number =>
  Number.parseFloat(slot.style.top) +
  Number.parseFloat(slot.closest<HTMLElement>('.a-group')?.style.top ?? '0');
import { renderApp, resetStores, testQueryClient } from './support/render-app';

const NOW = new Date(2026, 10, 19, 12, 0);
const THREADS = 1_000;
const INBOX_KEY = queryKeys.threadList(threadListParams({ view: 'inbox' }));

const inboxPage = (queryClient: QueryClient): ThreadPage | undefined =>
  queryClient.getQueryData<ThreadPage>(INBOX_KEY);

const loadedCount = (queryClient: QueryClient): number => inboxPage(queryClient)?.items.length ?? 0;

const inboxCalls = (counting: CountingClient) =>
  counting.listCalls.filter((call) => call.view === 'inbox' && call.splitId === undefined);

const start = async (client?: (counting: CountingClient) => MailClient) => {
  const state = bulkDemoState(THREADS, NOW);
  const counting = countingListClient(state, () => NOW);
  const queryClient = testQueryClient();
  useUiStore.setState({ rightOpen: false });
  renderApp({ demo: () => client?.(counting) ?? counting.client, queryClient });
  const listbox = await threadListbox();
  await waitForRows();
  return { state, counting, queryClient, listbox };
};

const loadPages = async (listbox: HTMLElement, queryClient: QueryClient, pages: number) => {
  for (let page = 1; page < pages; page += 1) {
    const before = loadedCount(queryClient);
    scrollListToEnd(listbox);
    await waitFor(() => {
      expect(loadedCount(queryClient)).toBeGreaterThan(before);
    });
  }
};

describe('thread list pagination', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    resetStores();
  });
  afterEach(() => {
    resetStores();
    vi.useRealTimers();
  });

  it('loads the next page through the cursor when the viewport nears the end', async () => {
    const { counting, queryClient, listbox } = await start();
    await loadPages(listbox, queryClient, 2);

    expect(inboxCalls(counting).map((call) => call.cursor)).toContain('200');
    expect(loadedCount(queryClient)).toBe(400);
    await loadPages(listbox, queryClient, 5);
    const all = inboxPage(queryClient);
    expect(all?.nextCursor).toBeNull();
    expect(new Set(all?.items.map((item) => item.id)).size).toBe(all?.items.length);
    const option = within(listbox).getAllByRole('option')[0];
    expect(option?.getAttribute('aria-setsize')).toBe(String(all?.items.length));
  });

  it('puts new mail at the top without dropping or refetching the loaded pages', async () => {
    const { state, counting, queryClient, listbox } = await start();
    await loadPages(listbox, queryClient, 3);
    const before = loadedCount(queryClient);
    const calls = counting.listCalls.length;
    const fresh = { ...bulkThread(0, NOW), id: bulkThread(-1, NOW).id, subject: 'Úplne nová' };
    addDemoThread(state, fresh);
    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'thread.upserted',
        at: NOW.toISOString(),
        data: { thread: fresh },
      });
    });

    await waitFor(() => {
      expect(inboxPage(queryClient)?.items[0]?.id).toBe(fresh.id);
    });
    expect(loadedCount(queryClient)).toBe(before + 1);
    expect(counting.listCalls.slice(calls).every((call) => call.cursor === undefined)).toBe(true);
  });

  it('keeps the rows in view in place when new mail arrives above them', async () => {
    const { state, queryClient, listbox } = await start();
    scrollListTo(listbox, 4_400);
    const element = scrollElementOf(listbox);
    const subjectAtTop = (): string | null | undefined =>
      Array.from(listbox.querySelectorAll<HTMLElement>('.a-slot'))
        .filter((slot) => slotTop(slot) >= element.scrollTop)
        .sort((left, right) => slotTop(left) - slotTop(right))[0]
        ?.querySelector('.subj')?.textContent;
    const subject = subjectAtTop();
    const fresh = { ...bulkThread(-1, NOW), subject: 'Úplne nová' };
    addDemoThread(state, fresh);
    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'thread.upserted',
        at: NOW.toISOString(),
        data: { thread: fresh },
      });
    });

    await waitFor(() => {
      expect(inboxPage(queryClient)?.items[0]?.id).toBe(fresh.id);
    });
    await waitFor(() => {
      expect(element.scrollTop).toBe(4_400 + LIST_ROW_HEIGHT);
    });
    expect(subject).toBeDefined();
    expect(subjectAtTop()).toBe(subject);
  });

  it('updates and removes threads deep in the loaded pages in place', async () => {
    const { counting, queryClient, listbox } = await start();
    await loadPages(listbox, queryClient, 3);
    const deep = inboxPage(queryClient)?.items[450];
    expect(deep).toBeDefined();
    const calls = counting.listCalls.length;
    if (deep === undefined) {
      return;
    }
    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'thread.upserted',
        at: NOW.toISOString(),
        data: { thread: { ...deep, unread: !deep.unread } },
      });
    });
    expect(inboxPage(queryClient)?.items[450]?.unread).toBe(!deep.unread);
    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'thread.removed',
        at: NOW.toISOString(),
        data: { threadId: deep.id, accountId: deep.accountId },
      });
    });

    expect(inboxPage(queryClient)?.items.some((item) => item.id === deep.id)).toBe(false);
    expect(loadedCount(queryClient)).toBe(599);
    expect(counting.listCalls.slice(calls).every((call) => call.cursor === undefined)).toBe(true);
  });

  it('offers a retry when an older page fails to load', async () => {
    let failures = 1;
    const { queryClient, listbox } = await start((counting) => ({
      ...counting.client,
      listThreads: (params) => {
        if (params.cursor !== undefined && failures > 0) {
          failures -= 1;
          return Promise.reject(new Error('Spojenie zlyhalo'));
        }
        return counting.client.listThreads(params);
      },
    }));
    scrollListToEnd(listbox);

    const retry = await screen.findByRole('button', { name: 'Skúsiť znova' });
    expect(screen.getByText('Staršie konverzácie sa nepodarilo načítať.')).toBeDefined();
    expect(loadedCount(queryClient)).toBe(200);
    act(() => {
      fireEvent.click(retry);
    });
    await waitFor(() => {
      expect(loadedCount(queryClient)).toBe(400);
    });
    expect(screen.queryByRole('button', { name: 'Skúsiť znova' })).toBeNull();
  });
});
