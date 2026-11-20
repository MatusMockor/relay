// @vitest-environment jsdom
import type { HistoryProgress, MailAccount } from '@relay/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { DemoHistory, type DemoHistorySeed } from '../src/data/demo/demo-history';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { present } from './support/present';
import { renderApp, resetStores } from './support/render-app';

const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');

const historyClient = (seed?: DemoHistorySeed) => {
  const seen: MailAccount[] = [];
  const history = new DemoHistory((accounts) => {
    seen.splice(0, seen.length, ...accounts);
    return seed === undefined ? [] : seed(accounts);
  });
  const client = createDemoMailClient({ aiStepMs: 0, history });
  const progressOf = (patch: Partial<HistoryProgress>): HistoryProgress => ({
    accountId: present(seen[0]).id,
    stored: 12_340,
    total: 48_000,
    state: 'running',
    ...patch,
  });
  const publish = async (patch: Partial<HistoryProgress>) => {
    const progress = progressOf(patch);
    await act(async () => {
      history.publish(progress);
      await Promise.resolve();
    });
  };
  return { client, history, publish };
};

const firstRunning: DemoHistorySeed = (accounts) =>
  accounts.slice(0, 1).map((account) => ({
    accountId: account.id,
    stored: 12_340,
    total: 48_000,
    state: 'running',
  }));

const openSync = async () => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'sync', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const historyText = (sheet: HTMLElement): string =>
  (within(sheet).getByText('Staršia pošta').closest('.srow')?.textContent ?? '').replace(NBSP, ' ');

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
