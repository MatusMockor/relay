// @vitest-environment jsdom
import type { HistoryState } from '@relay/shared';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemoHistory } from '../src/data/demo/demo-history';
import { historyText, openSync } from './support/history-settings';
import { renderApp, resetStores } from './support/render-app';
import { barValue, openAccounts, statusText, syncingClient } from './support/sync-progress';

describe('settling the sync state when a sync ends', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('drops the initial sync progress on a failed sync even before the account refetch', async () => {
    const sync = syncingClient();
    renderApp({ demo: () => sync.client });
    const card = await openAccounts(sync.account);
    await sync.progress('backlog', 10, 40);
    await waitFor(() => {
      expect(barValue(card)).toBe('25');
    });

    await sync.announce('error');

    await waitFor(() => {
      expect(barValue(card)).toBeNull();
    });
    expect(statusText(card)).not.toContain('Sťahujem');
  });

  it('refreshes a waiting history once the first sync of the account ends', async () => {
    const history: { state: HistoryState } = { state: 'waiting' };
    const demo = new DemoHistory((accounts) =>
      accounts.slice(0, 1).map((account) => ({
        accountId: account.id,
        stored: 500,
        total: 48_000,
        state: history.state,
      })),
    );
    const sync = syncingClient(demo);
    renderApp({ demo: () => sync.client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Začnem sťahovať po dokončení prvej synchronizácie');
    });
    const reads = demo.reads;

    await sync.announce('syncing');
    expect(demo.reads).toBe(reads);
    history.state = 'running';
    await sync.finish();

    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 500 z 48 000 správ');
    });
  });
});
