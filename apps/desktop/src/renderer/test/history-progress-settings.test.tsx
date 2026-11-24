// @vitest-environment jsdom
import { act, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { MailClient } from '../src/data/MailClient';
import { firstRunning, historyClient, historyText, openSync } from './support/history-settings';
import { present } from './support/present';
import { renderApp, resetStores } from './support/render-app';

describe('older mail progress in sync settings', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('shows the download progress with Slovak number formatting and follows realtime updates', async () => {
    const { client, publish } = historyClient(firstRunning);
    renderApp({ demo: () => client });
    const sheet = await openSync();

    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 12 340 z 48 000 správ');
    });
    expect(within(sheet).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('26');

    await publish({ state: 'paused' });
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Pozastavené, skúsim znova o chvíľu');
    });

    await publish({ stored: 24_000, state: 'running' });
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 24 000 z 48 000 správ');
    });
    expect(within(sheet).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');

    await publish({ stored: 30_000, state: 'error' });
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Pozastavené, skúsim znova o chvíľu');
    });
    expect(within(sheet).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('63');

    await publish({ stored: 48_000, state: 'done' });
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Celá história je stiahnutá');
    });
    expect(within(sheet).queryByRole('progressbar')).toBeNull();
  });

  it('says the history waits for the first sync instead of showing frozen numbers', async () => {
    const { client, publish } = historyClient(firstRunning);
    renderApp({ demo: () => client });
    const sheet = await openSync();

    await publish({ stored: 500, state: 'waiting' });
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Začnem sťahovať po dokončení prvej synchronizácie');
    });
    expect(historyText(sheet)).not.toContain('Sťahujem históriu');
    expect(within(sheet).queryByRole('progressbar')).toBeNull();

    await publish({ stored: 900, state: 'running' });
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 900 z 48 000 správ');
    });
  });

  it('drops a removed account from the progress', async () => {
    const accounts = await createDemoMailClient().listAccounts();
    expect(accounts.length).toBeGreaterThan(1);
    const removed = present(accounts[0]).id;
    const { client } = historyClient((listed) =>
      listed.map((account) => ({
        accountId: account.id,
        stored: account.id === removed ? 100 : 500,
        total: 500,
        state: account.id === removed ? 'running' : 'done',
      })),
    );
    renderApp({ demo: () => client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu');
    });

    await act(async () => {
      await client.removeAccount(removed);
    });

    await waitFor(() => {
      expect(historyText(sheet)).toContain('Celá história je stiahnutá');
    });
  });

  it('hides the row in remote mode', async () => {
    const { client, history } = historyClient(firstRunning);
    const remote: MailClient = { ...client, kind: 'remote' };
    renderApp({ demo: () => remote });
    const sheet = await openSync();
    await waitFor(() => {
      expect(within(sheet).getByText('Skontrolovať teraz', { selector: 'b' })).toBeTruthy();
    });
    expect(within(sheet).queryByText('Staršia pošta')).toBeNull();
    expect(history.reads).toBe(0);
  });

  it('hides the row when no account has history', async () => {
    const { client, history } = historyClient();
    renderApp({ demo: () => client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(history.reads).toBe(1);
    });
    expect(within(sheet).queryByText('Staršia pošta')).toBeNull();
  });
});
