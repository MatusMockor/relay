// @vitest-environment jsdom
import { waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import { useToastStore } from '../src/state/toast-store';
import { demoClient, settle } from './features-support';
import { click, openAutomations, openRule } from './support/automations';
import { resetStores } from './support/render-app';

const MERGED = 'Merge request !409 bol zlúčený';

const openHistory = async (client: MailClient, name: string): Promise<HTMLElement> => {
  const sheet = await openAutomations(client);
  const rule = openRule(sheet, name);
  click(within(rule).getByRole('radio', { name: 'História' }));
  return within(rule).findByRole('region', { name: 'História pravidla' });
};

const stat = (history: HTMLElement, term: string): string => {
  const label = within(history).getByText(term, { selector: 'dt' });
  return label.nextElementSibling?.textContent ?? '';
};

const entry = (history: HTMLElement, subject: string): HTMLElement =>
  within(within(history).getByRole('list', { name: 'Posledné spustenia' }))
    .getAllByRole('listitem')
    .filter((item) => item.classList.contains('au-hist-row'))
    .find((item) => item.textContent.includes(subject)) ?? history;

const toast = (): string | undefined => useToastStore.getState().toast?.message;

const stateOf = async (client: MailClient, key: string) =>
  (await client.getThread(demoIds.thread(key))).thread;

describe('Nastavenia > Automatizácie > história pravidla', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('shows the stats and the recent runs of a seeded rule', async () => {
    const history = await openHistory(demoClient(), 'GitLab do Projektov');
    await within(history).findByRole('list', { name: 'Posledné spustenia' });

    expect(stat(history, 'Spustenia za 30 dní')).toBe('3');
    expect(stat(history, 'Zlyhané akcie')).toBe('2');
    expect(stat(history, 'Posledné spustenie')).toMatch(/^dnes /);
    const merged = entry(history, MERGED);
    expect(within(merged).getByText('označené ako prečítané')).toBeDefined();
    expect(within(merged).getByText('archivované')).toBeDefined();
    const failed = entry(history, 'Pipeline zlyhala: main #2291');
    expect(within(failed).getAllByText(/\(zlyhalo\)$/)).toHaveLength(2);
    expect(within(failed).getByText('štítok eFabrica (zlyhalo)')).toBeDefined();
    expect(within(failed).getByText('presunuté do Projekty (zlyhalo)')).toBeDefined();
    expect(within(history).getByText('existujúce maily')).toBeDefined();
    expect(within(history).getByText('Vrátené')).toBeDefined();
    expect(within(history).getAllByRole('button', { name: /^Vrátiť spustenie/ })).toHaveLength(1);
  });

  it('undoes one run and brings the thread back to the inbox', async () => {
    const client = demoClient();
    const history = await openHistory(client, 'GitLab do Projektov');

    click(await within(history).findByRole('button', { name: `Vrátiť spustenie ${MERGED}` }));
    await settle();

    expect(toast()).toBe('Vrátené');
    expect(await stateOf(client, 'o-mr-merged')).toMatchObject({ state: 'inbox', unread: true });
    await waitFor(() => {
      expect(within(entry(history, MERGED)).getByText('Vrátené')).toBeDefined();
    });
    expect(
      within(history).queryByRole('button', { name: `Vrátiť spustenie ${MERGED}` }),
    ).toBeNull();
  });

  it('undoes everything from today', async () => {
    const client = demoClient();
    const history = await openHistory(client, 'GitLab do Projektov');
    const today = await within(history).findByRole('button', { name: 'Vrátiť všetko z dneška' });

    click(today);
    await settle();

    expect(toast()).toBe('Vrátené spustenia: 1');
    expect((await stateOf(client, 'o-mr-merged')).state).toBe('inbox');
    await waitFor(() => {
      expect(today).toHaveProperty('disabled', true);
    });
  });

  it('shows an empty history for a rule that never ran', async () => {
    const history = await openHistory(demoClient(), 'Tibor');

    expect(await within(history).findByText('Pravidlo sa zatiaľ nespustilo.')).toBeDefined();
    expect(stat(history, 'Posledné spustenie')).toBe('Ešte nikdy');
  });
});
