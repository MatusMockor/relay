import { type Split, supportedSplits } from '@relay/shared';
import { act, screen, within } from '@testing-library/react';
import type { MailClient } from '../../src/data/MailClient';
import { setUi } from '../../src/state/ui-store';
import { click } from './automations';
import { renderApp } from './render-app';

export const openSplits = async (client: MailClient): Promise<HTMLElement> => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'splits', adding: false } });
  });
  const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
  await within(sheet).findByRole('listitem', { name: 'Split Jira' });
  return sheet;
};

export const openSplit = (sheet: HTMLElement, name: string): HTMLElement => {
  click(within(sheet).getByRole('button', { name: `Otvoriť split ${name}` }));
  return within(sheet).getByRole('region', { name: `Split ${name}` });
};

export const splitNames = (sheet: HTMLElement): string[] =>
  within(within(sheet).getByRole('list', { name: 'Splity' }))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label') ?? '');

export const storedSplit = async (client: MailClient, name: string): Promise<Split | undefined> =>
  supportedSplits(await client.listSplits()).find((split) => split.name === name);

export const splitSummary = (region: HTMLElement): string =>
  within(region).getByRole('region', { name: 'Zhrnutie splitu' }).textContent;
