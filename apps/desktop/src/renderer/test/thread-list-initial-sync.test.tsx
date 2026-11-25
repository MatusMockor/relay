// @vitest-environment jsdom
import { AccountIdSchema } from '@relay/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { applyRealtimeEvent } from '../src/data/hooks/realtime-cache';
import { queryKeys } from '../src/data/hooks/query-keys';
import { renderApp, resetStores, testQueryClient } from './support/render-app';

describe('ThreadList initial sync UX', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('shows initial sync progress instead of Inbox Zero when a brand-new account is empty', async () => {
    const queryClient = testQueryClient();
    const state = buildDemoState();
    const account = state.accounts[0];
    expect(account).toBeDefined();
    if (account === undefined) {
      return;
    }
    state.accounts = [{ ...account, status: 'syncing', lastSyncedAt: null }];
    state.threads.clear();

    renderApp({
      queryClient,
      demo: () => createDemoMailClient({ state, aiStepMs: 0 }),
    });

    expect(
      await screen.findByRole('heading', { name: `Načítavam ${account.displayName}…` }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Všetko vybavené' })).toBeNull();

    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'sync.progress',
        at: '2026-11-15T10:00:00.000Z',
        data: {
          accountId: account.id,
          mailboxId: null,
          phase: 'messages',
          processed: 8,
          total: 15,
          stage: 'inbox',
        },
      });
    });

    expect(await screen.findByText('Sťahujem najnovšiu doručenú poštu… 8 / 15')).toBeTruthy();
  });

  it('shows the staged progress of a later account while an earlier one syncs incrementally', async () => {
    const queryClient = testQueryClient();
    const state = buildDemoState();
    const [first, second] = state.accounts;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }
    state.accounts = [
      { ...first, status: 'syncing' },
      { ...second, status: 'syncing' },
    ];

    renderApp({
      queryClient,
      demo: () => createDemoMailClient({ state, aiStepMs: 0 }),
    });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'sync.progress',
        at: '2026-11-15T10:00:00.000Z',
        data: {
          accountId: second.id,
          mailboxId: null,
          phase: 'messages',
          processed: 20,
          total: 80,
          stage: 'backlog',
        },
      });
    });

    expect(await screen.findByText('Sťahujem nedávnu poštu… 20 / 80')).toBeTruthy();
  });

  it('shows a non-blocking sync strip once initial messages arrive and hides it when done', async () => {
    const queryClient = testQueryClient();
    const state = buildDemoState();
    const account = state.accounts[0];
    expect(account).toBeDefined();
    if (account === undefined) {
      return;
    }
    state.accounts = [{ ...account, status: 'syncing', lastSyncedAt: null }];

    renderApp({
      queryClient,
      demo: () => createDemoMailClient({ state, aiStepMs: 0 }),
    });

    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'sync.progress',
        at: '2026-11-15T10:00:00.000Z',
        data: {
          accountId: AccountIdSchema.parse(account.id),
          mailboxId: null,
          phase: 'messages',
          processed: 15,
          total: 60,
          stage: 'backlog',
        },
      });
    });

    expect(await screen.findByText('Sťahujem nedávnu poštu… 15 / 60')).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Konverzácie' })).toBeTruthy();

    state.accounts = [
      { ...account, status: 'connected', lastSyncedAt: '2026-11-15T10:01:00.000Z' },
    ];
    act(() => {
      applyRealtimeEvent(queryClient, {
        type: 'account.status',
        at: '2026-11-15T10:01:00.000Z',
        data: {
          accountId: account.id,
          status: 'connected',
          lastSyncedAt: '2026-11-15T10:01:00.000Z',
          error: null,
        },
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
    });

    await waitFor(() => {
      expect(screen.queryByText('Sťahujem nedávnu poštu… 15 / 60')).toBeNull();
    });
  });
});
