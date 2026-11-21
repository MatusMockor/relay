import { supportedSplits } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';
import { demoIds } from '../../src/data/demo/seed/ids';
import type { MailClient } from '../../src/data/MailClient';
import { setUi } from '../../src/state/ui-store';
import { click } from './automations';
import { present } from './present';
import { renderApp } from './render-app';

export const TITLE = 'Nové pravidlo z mailu';
export const SENDER = { type: 'fromAddress', address: 'tomas.balaz@firma.sk' };

export const openLunch = async (client: MailClient): Promise<HTMLElement> => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'ruleFromMail', threadId: demoIds.thread('c-lunch') } });
  });
  const dialog = await screen.findByRole('dialog', { name: TITLE });
  await within(dialog).findByRole('group', { name: 'Akcie pravidla' });
  click(within(dialog).getByRole('button', { name: 'Zaradiť do splitu…' }));
  return within(dialog).getByRole('region', { name: 'Zaradiť do splitu' });
};

export const pick = (panel: HTMLElement, name: string) => {
  const select = within(panel).getByRole<HTMLSelectElement>('combobox', { name: 'Split' });
  const option = present(
    within(select)
      .getAllByRole<HTMLOptionElement>('option')
      .find((item) => item.textContent === name),
  );
  act(() => {
    fireEvent.change(select, { target: { value: option.value } });
  });
};

export const splitNamed = async (client: MailClient, name: string) =>
  present(supportedSplits(await client.listSplits()).find((split) => split.name === name));

export const closed = async () => {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
  });
};

export const lunchSplits = async (client: MailClient) =>
  (await client.getThread(demoIds.thread('c-lunch'))).thread.splitIds;
