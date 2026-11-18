// @vitest-environment jsdom
import type { Automation } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openSection = async (client: MailClient) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
  });
  const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
  await within(sheet).findByRole('region', { name: 'Pravidlo Tibor' });
  return sheet;
};

const card = (sheet: HTMLElement, name: string) =>
  within(sheet).getByRole('region', { name: `Pravidlo ${name}` });

const click = (element: HTMLElement) => {
  act(() => {
    fireEvent.click(element);
  });
};

const popover = (name: string) => screen.getByRole('dialog', { name });

const stored = async (client: MailClient, name: string): Promise<Automation | undefined> =>
  (await client.listAutomations()).find((item) => item.name === name);

describe('Nastavenia > Automatizácie', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lists the rules as sentences and toggles one', async () => {
    const client = demoClient();
    const sheet = await openSection(client);
    const mentions = card(sheet, 'Jira spomenutia');

    expect(within(mentions).getByText('eFabrica', { selector: '.scope' })).toBeDefined();
    expect([...mentions.querySelectorAll('.sent-r')].map((row) => row.textContent)).toEqual([
      'Keďna eFabrica príde mail, kde Jira udalosť je Spomenutie×aprojekt je ECOM×+ podmienka',
      'PotomAI zhrnutie× Vytvoriť task× + akcia',
    ]);
    expect(within(card(sheet, 'Jira tasky')).getByText('predvolené')).toBeDefined();
    click(within(card(sheet, 'Tibor')).getByRole('switch', { name: 'Pravidlo Tibor zapnuté' }));
    await settle();

    expect((await stored(client, 'Tibor'))?.enabled).toBe(false);
  });

  it('adds a condition and an action through the popovers', async () => {
    const client = demoClient();
    const sheet = await openSection(client);
    const tibor = card(sheet, 'Tibor');

    click(within(tibor).getByRole('button', { name: 'Pridať podmienku' }));
    const form = popover('Nová podmienka');
    act(() => {
      fireEvent.change(within(form).getByLabelText('Podmienka'), {
        target: { value: 'jiraEvent' },
      });
      fireEvent.change(within(form).getByLabelText('Udalosť'), { target: { value: 'comment' } });
    });
    click(within(form).getByRole('button', { name: 'Pridať' }));
    await settle();
    click(within(card(sheet, 'Tibor')).getByRole('button', { name: 'Pridať akciu' }));
    click(within(popover('Nová akcia')).getByRole('button', { name: 'Archivovať' }));
    await settle();

    expect(await stored(client, 'Tibor')).toMatchObject({
      conditions: [
        { type: 'fromAddress', address: 'tibor@codevo.app' },
        { type: 'jiraEvent', kind: 'comment' },
      ],
      actions: ['task', 'notify', 'archive'],
    });
  });

  it('changes the provider and the model and edits the instructions', async () => {
    const client = demoClient();
    const sheet = await openSection(client);

    click(within(card(sheet, 'Tibor')).getByRole('button', { name: /^Model AI:/ }));
    const picker = popover('Model AI');
    click(within(picker).getByRole('radio', { name: /Codex/ }));
    await settle();
    const models = within(popover('Model AI')).getByRole('radiogroup', { name: 'Model' });
    expect(
      within(models)
        .getAllByRole('radio')
        .map((item) => item.textContent),
    ).toEqual(['GPT-6.1 Sol✓', 'GPT-6 Astra', 'GPT-6 Luna']);
    click(within(models).getByRole('radio', { name: /GPT-6 Luna/ }));
    await settle();
    const instructions = within(card(sheet, 'Tibor')).getByRole('textbox', {
      name: 'Inštrukcie pre AI',
    });
    act(() => {
      fireEvent.change(instructions, { target: { value: '  Iba keď niečo chce.  ' } });
      fireEvent.blur(instructions);
    });
    await settle();

    expect((await stored(client, 'Tibor'))?.ai).toEqual({
      runner: 'codex',
      model: 'gpt-6-luna',
      effort: null,
      instructions: 'Iba keď niečo chce.',
    });
  });

  it('deletes a rule but only turns off the default Jira rule', async () => {
    const client = demoClient();
    const sheet = await openSection(client);

    expect(
      within(card(sheet, 'Jira tasky')).queryByRole('button', { name: /^Odstrániť pravidlo/ }),
    ).toBeNull();
    click(within(card(sheet, 'Tibor')).getByRole('button', { name: 'Odstrániť pravidlo Tibor' }));
    await settle();

    expect((await client.listAutomations()).map((item) => item.name)).toEqual([
      'Jira spomenutia',
      'Jira tasky',
    ]);
    expect(within(sheet).queryByRole('region', { name: 'Pravidlo Tibor' })).toBeNull();
  });

  it('keeps a new rule unsaved until it has a condition', async () => {
    const client = demoClient();
    const sheet = await openSection(client);

    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
    const draft = card(sheet, 'Nové pravidlo');
    expect(draft.className).toBe('au ed');
    expect(within(draft).getByRole('status').textContent).toBe(
      'Pridaj aspoň jednu podmienku, potom sa pravidlo uloží.',
    );
    click(within(draft).getByRole('button', { name: 'Premenovať pravidlo Nové pravidlo' }));
    act(() => {
      fireEvent.change(within(draft).getByLabelText('Názov pravidla'), {
        target: { value: 'Faktúry' },
      });
      fireEvent.keyDown(within(draft).getByLabelText('Názov pravidla'), { key: 'Enter' });
    });
    await settle();
    expect(await client.listAutomations()).toHaveLength(3);

    click(within(card(sheet, 'Faktúry')).getByRole('button', { name: 'Pridať podmienku' }));
    const form = popover('Nová podmienka');
    act(() => {
      fireEvent.change(within(form).getByLabelText('Podmienka'), {
        target: { value: 'fromDomain' },
      });
      fireEvent.change(within(form).getByLabelText('Doména'), { target: { value: 'firma.sk' } });
    });
    click(within(form).getByRole('button', { name: 'Pridať' }));

    await waitFor(async () => {
      expect(await stored(client, 'Faktúry')).toMatchObject({
        accountId: null,
        enabled: true,
        conditions: [{ type: 'fromDomain', domain: 'firma.sk' }],
        actions: ['task'],
        ai: { runner: 'claude', model: null, effort: null, instructions: null },
      });
    });
    expect(within(sheet).queryByRole('status')).toBeNull();
  });
});
