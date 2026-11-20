// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { supportedSplits } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { click } from './support/automations';
import { present } from './support/present';
import { renderApp, resetStores } from './support/render-app';

const TITLE = 'Nové pravidlo z mailu';
const SENDER = { type: 'fromAddress', address: 'tomas.balaz@firma.sk' };

const openLunch = async (client: MailClient): Promise<HTMLElement> => {
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

const pick = (panel: HTMLElement, name: string) => {
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

const splitNamed = async (client: MailClient, name: string) =>
  present(supportedSplits(await client.listSplits()).find((split) => split.name === name));

const closed = async () => {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
  });
};

const lunchSplits = async (client: MailClient) =>
  (await client.getThread(demoIds.thread('c-lunch'))).thread.splitIds;

describe('Zaradiť do splitu z mailu', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('adds the checked condition to an existing split of the account', async () => {
    const client = demoClient();
    const panel = await openLunch(client);

    expect(
      within(panel)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Jira', 'Ostatné', 'Nový split…']);
    pick(panel, 'Jira');
    click(within(panel).getByRole('button', { name: 'Zaradiť' }));
    await closed();

    expect((await splitNamed(client, 'Jira')).rules).toContainEqual(SENDER);
    expect(await lunchSplits(client)).toContain(demoIds.split('jira'));
    expect(screen.getByRole('status').textContent).toContain('Mail pôjde do splitu Jira');
  });

  it('creates a new split when several conditions cannot join an existing one and opens it', async () => {
    const client = demoClient();
    const panel = await openLunch(client);
    const options = screen.getByRole('group', { name: 'Podľa čoho rozpoznať maily' });
    click(within(options).getByRole('checkbox', { name: 'Z domény firma.sk' }));

    expect(within(panel).getByRole('status').textContent).toContain(
      'Do existujúceho splitu sa dá pridať jedna podmienka',
    );
    expect(within(panel).getByRole<HTMLButtonElement>('button', { name: 'Zaradiť' }).disabled).toBe(
      true,
    );
    pick(panel, 'Nový split…');
    const name = within(panel).getByRole<HTMLInputElement>('textbox', {
      name: 'Názov nového splitu',
    });
    expect(name.value).toBe('Tomáš Baláž');
    act(() => {
      fireEvent.change(name, { target: { value: 'Tomáš' } });
    });
    click(within(panel).getByRole('button', { name: 'Zaradiť' }));
    await closed();

    const editor = await screen.findByRole('region', { name: 'Split Tomáš' });
    expect(within(editor).getByRole('region', { name: 'Zhrnutie splitu' }).textContent).toContain(
      'Do splitu Tomáš pôjdu maily z účtu',
    );
    const created = await splitNamed(client, 'Tomáš');
    expect(created).toMatchObject({
      accountId: demoIds.account('efa'),
      match: 'all',
      rules: [SENDER, { type: 'fromDomain', domain: 'firma.sk' }],
      exceptions: [],
    });
    expect(await lunchSplits(client)).toContain(created.id);
  });

  it('goes back to the rule actions without saving', async () => {
    const client = demoClient();
    const panel = await openLunch(client);
    const before = await client.listSplits();

    click(within(panel).getByRole('button', { name: 'Späť' }));

    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(within(dialog).getByRole('button', { name: 'Vytvoriť' })).toBeDefined();
    expect(await client.listSplits()).toEqual(before);
  });
});
