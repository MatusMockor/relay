import type { HistoryProgress, MailAccount } from '@relay/shared';
import { act, screen, within } from '@testing-library/react';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import { DemoHistory, type DemoHistorySeed } from '../../src/data/demo/demo-history';
import { setUi } from '../../src/state/ui-store';
import { present } from './present';

const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');

export const historyClient = (seed?: DemoHistorySeed) => {
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

export const firstRunning: DemoHistorySeed = (accounts) =>
  accounts.slice(0, 1).map((account) => ({
    accountId: account.id,
    stored: 12_340,
    total: 48_000,
    state: 'running',
  }));

export const openSync = async () => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'sync', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

export const historyText = (sheet: HTMLElement): string =>
  (within(sheet).queryByText('Staršia pošta')?.closest('.srow')?.textContent ?? '').replace(
    NBSP,
    ' ',
  );
