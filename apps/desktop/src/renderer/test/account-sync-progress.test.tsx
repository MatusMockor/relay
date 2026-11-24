// @vitest-environment jsdom
import { MailboxIdSchema } from '@relay/shared';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, resetStores } from './support/render-app';
import {
  barValue,
  openAccounts,
  statusText,
  SYNC_AT,
  syncingClient,
} from './support/sync-progress';

describe('initial sync progress on the account row', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('follows every initial sync stage and clears when the sync ends', async () => {
    const sync = syncingClient();
    renderApp({ demo: () => sync.client });
    const card = await openAccounts(sync.account);

    expect(statusText(card)).toContain('zatiaľ nesynchronizované');
    expect(barValue(card)).toBeNull();

    await sync.progress('headers', 1, 4);
    await waitFor(() => {
      expect(statusText(card)).toContain('Načítavam zoznamy správ… 1 / 4 priečinkov');
    });
    expect(barValue(card)).toBe('25');

    await sync.progress('inbox', 0, 15);
    await waitFor(() => {
      expect(statusText(card)).toContain('Sťahujem najnovšiu doručenú poštu… 0 / 15');
    });

    await sync.progress('backlog', 1_200, 1_800);
    await waitFor(() => {
      expect(statusText(card)).toContain('Sťahujem nedávnu poštu… 1 200 / 1 800');
    });
    expect(barValue(card)).toBe('67');

    await sync.emit({
      type: 'sync.progress',
      at: SYNC_AT,
      data: {
        accountId: sync.account().id,
        mailboxId: MailboxIdSchema.parse('mbx-inbox'),
        phase: 'messages',
        processed: 3,
        total: 9,
      },
    });
    expect(statusText(card)).toContain('Sťahujem nedávnu poštu… 1 200 / 1 800');

    await sync.finish();
    await waitFor(() => {
      expect(statusText(card)).toContain('posledná synchronizácia');
    });
    expect(statusText(card)).not.toContain('Sťahujem');
    expect(barValue(card)).toBeNull();
  });

  it('shows no stage text for a sync step without a stage', async () => {
    const sync = syncingClient();
    renderApp({ demo: () => sync.client });
    const card = await openAccounts(sync.account);

    await sync.progress('backlog', 10, 20);
    await waitFor(() => {
      expect(barValue(card)).toBe('50');
    });
    await sync.progress(undefined, 20, null);

    await waitFor(() => {
      expect(barValue(card)).toBeNull();
    });
    expect(statusText(card)).toContain('zatiaľ nesynchronizované');
    expect(statusText(card)).toContain('Synchronizujem…');
  });
});
