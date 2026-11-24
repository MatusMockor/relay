// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { INVALIDATION_WINDOW_MS } from '../src/data/hooks/invalidation-batch';
import { queryKeys } from '../src/data/hooks/query-keys';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { useUiStore } from '../src/state/ui-store';
import { demoClient, openThreadBySubject, press, settle } from './features-support';
import { renderApp, resetStores, testQueryClient } from './support/render-app';

const SUBJECT = 'Obed v piatok?';

const release = (button: number): void => {
  act(() => {
    fireEvent.mouseUp(window, { button });
  });
};

describe('a thread that no longer exists', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('shows the list instead of loading forever when history reopens it', async () => {
    const client = demoClient();
    const queryClient = testQueryClient();
    renderApp({ demo: () => client, queryClient });
    const threadId = demoIds.thread('c-lunch');
    const { thread } = await client.getThread(threadId);
    await openThreadBySubject(SUBJECT);
    expect(useUiStore.getState().openThreadId).toBe(threadId);
    press('Escape', {}, document.body);
    expect(useUiStore.getState().openThreadId).toBeNull();
    await act(async () => {
      await client.removeAccount(thread.accountId);
    });
    await settle(INVALIDATION_WINDOW_MS + 30);

    release(3);
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBeNull();
    });
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    release(3);

    expect(useUiStore.getState().openThreadId).toBeNull();
  });

  it('marks the cached detail of a removed thread as outdated', async () => {
    const client = demoClient();
    const queryClient = testQueryClient();
    const threadId = demoIds.thread('c-lunch');
    const detail = await client.getThread(threadId);
    queryClient.setQueryData(queryKeys.thread(threadId), detail);

    applyRealtimeEvent(queryClient, {
      type: 'thread.removed',
      at: new Date().toISOString(),
      data: { threadId, accountId: detail.thread.accountId },
    });
    await settle(INVALIDATION_WINDOW_MS + 30);

    expect(queryClient.getQueryState(queryKeys.thread(threadId))?.isInvalidated).toBe(true);
  });
});
