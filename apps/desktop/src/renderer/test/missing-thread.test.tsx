// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { queryKeys } from '../src/data/hooks/query-keys';
import { useUiStore } from '../src/state/ui-store';
import { demoClient, openThreadBySubject, press } from './features-support';
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
    queryClient.removeQueries({ queryKey: queryKeys.thread(threadId) });

    release(3);
    await waitFor(() => {
      expect(useUiStore.getState().openThreadId).toBeNull();
    });
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    release(3);

    expect(useUiStore.getState().openThreadId).toBeNull();
  });
});
