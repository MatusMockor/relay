import { supportedAutomations } from '@relay/shared';
import type { Automation } from '@relay/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { MailClient } from '../../src/data/MailClient';
import { setUi } from '../../src/state/ui-store';
import { renderApp } from './render-app';

export const click = (element: HTMLElement): void => {
  act(() => {
    fireEvent.click(element);
  });
};

export const openAutomations = async (client: MailClient): Promise<HTMLElement> => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
  });
  const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
  await within(sheet).findByRole('listitem', { name: 'Pravidlo Tibor' });
  return sheet;
};

export const row = (sheet: HTMLElement, name: string): HTMLElement =>
  within(sheet).getByRole('listitem', { name: `Pravidlo ${name}` });

export const ruleNames = (sheet: HTMLElement): string[] =>
  within(within(sheet).getByRole('list', { name: 'Pravidlá' }))
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('aria-label') ?? '');

export const openRule = (sheet: HTMLElement, name: string): HTMLElement => {
  click(within(sheet).getByRole('button', { name: `Otvoriť pravidlo ${name}` }));
  return within(sheet).getByRole('region', { name: `Pravidlo ${name}` });
};

export const backToList = (sheet: HTMLElement): void => {
  click(within(sheet).getByRole('button', { name: 'Späť na automatizácie' }));
};

export const popover = (name: string): HTMLElement => screen.getByRole('dialog', { name });

export const stored = async (client: MailClient, name: string): Promise<Automation | undefined> =>
  supportedAutomations(await client.listAutomations()).find((item) => item.name === name);

export const change = (element: HTMLElement, value: string): void => {
  act(() => {
    fireEvent.change(element, { target: { value } });
  });
};

export const condition = (region: HTMLElement, position: number): HTMLElement =>
  within(region).getByRole('group', { name: `Podmienka ${String(position)}` });

export const checkbox = (region: HTMLElement, name: string): HTMLElement =>
  within(region).getByRole('checkbox', { name });
