// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, settle } from './features-support';
import {
  backToList,
  change,
  checkbox,
  click,
  condition,
  openAutomations,
  openRule,
  popover,
  row,
  ruleNames,
  stored,
} from './support/automations';
import { resetStores } from './support/render-app';

describe('Nastavenia > Automatizácie > detail', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('adds a condition and an action in the detail', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(within(tibor).getByRole('button', { name: '+ Pridať podmienku' }));
    change(within(condition(tibor, 2)).getByLabelText('Typ podmienky'), 'jiraEvent');
    await settle();
    change(within(condition(tibor, 2)).getByLabelText('Udalosť'), 'comment');
    await settle();
    click(checkbox(tibor, 'Archivovať'));
    await settle();

    expect(await stored(client, 'Tibor')).toMatchObject({
      conditions: [
        { type: 'fromAddress', address: 'tibor@codevo.app' },
        { type: 'jiraEvent', kind: 'comment' },
      ],
      actions: [{ type: 'task' }, { type: 'notify' }, { type: 'archive' }],
    });
    expect(within(tibor).getByText('a zároveň')).toBeDefined();
  });

  it('refuses an invalid condition and keeps the rule unchanged', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    const address = within(condition(tibor, 1)).getByLabelText('Adresa');

    change(address, 'nie je adresa');
    act(() => {
      fireEvent.keyDown(address, { key: 'Enter' });
    });
    await settle();

    expect(within(tibor).getByText('Doplň podmienku správne.')).toBeDefined();
    expect((await stored(client, 'Tibor'))?.conditions).toEqual([
      { type: 'fromAddress', address: 'tibor@codevo.app' },
    ]);
  });

  it('changes the provider and the model and edits the instructions', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    expect(
      within(tibor).getByText('„Vytvoriť úlohu“ používa AI. Nastavenie je voliteľné.'),
    ).toBeDefined();
    click(within(tibor).getByRole('button', { name: /^Model AI:/ }));
    click(within(popover('Model AI')).getByRole('radio', { name: /Codex/ }));
    await settle();
    const models = within(popover('Model AI')).getByRole('radiogroup', { name: 'Model' });
    expect(
      within(models)
        .getAllByRole('radio')
        .map((item) => item.textContent),
    ).toEqual(['GPT-6.1 Sol✓', 'GPT-6 Astra', 'GPT-6 Luna']);
    click(within(models).getByRole('radio', { name: /GPT-6 Luna/ }));
    await settle();
    const instructions = within(sheet).getByRole('textbox', { name: 'Inštrukcie pre AI' });
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

  it('hides the AI section when no action uses AI', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    expect(within(tibor).getByRole('heading', { name: 'AI' })).toBeDefined();
    expect(within(tibor).getAllByText('AI', { selector: '.chip' })).toHaveLength(2);

    click(checkbox(tibor, 'Archivovať'));
    await settle();
    click(checkbox(tibor, 'Vytvoriť úlohu'));
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toEqual([
      { type: 'notify' },
      { type: 'archive' },
    ]);
    expect(within(sheet).queryByRole('heading', { name: 'AI' })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /^Model AI:/ })).toBeNull();
  });

  it('keeps the last action checked', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const jira = openRule(sheet, 'Jira tasky');

    click(checkbox(jira, 'Vytvoriť úlohu'));
    await settle();

    expect(checkbox(jira, 'Vytvoriť úlohu')).toHaveProperty('checked', true);
    expect((await stored(client, 'Jira tasky'))?.actions).toEqual([{ type: 'task' }]);
  });

  it('deletes a rule from the detail', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    click(within(openRule(sheet, 'Tibor')).getByRole('button', { name: 'Odstrániť pravidlo' }));
    await settle();

    expect((await client.listAutomations()).map((item) => item.name)).toEqual([
      'Jira spomenutia',
      'GitLab do Projektov',
      'Jira tasky',
    ]);
    expect(ruleNames(sheet)).not.toContain('Pravidlo Tibor');
  });

  it('scopes the default Jira rule to one account', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const jira = openRule(sheet, 'Jira tasky');

    change(within(jira).getByRole('combobox', { name: 'Účet' }), 'acc-efa');
    await settle();

    expect(await stored(client, 'Jira tasky')).toMatchObject({
      preset: 'jiraTasks',
      accountId: 'acc-efa',
    });
    backToList(sheet);
    expect(within(row(sheet, 'Jira tasky')).getByText('eFabrica')).toBeDefined();
  });

  it('drops folder and label actions when the account changes', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const gitlab = openRule(sheet, 'GitLab do Projektov');

    change(within(gitlab).getByRole('combobox', { name: 'Účet' }), '');
    await settle();

    expect(await stored(client, 'GitLab do Projektov')).toMatchObject({
      accountId: null,
      actions: [{ type: 'task' }],
    });
  });

  it('keeps a new rule unsaved until it has a condition', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
    click(within(sheet).getByRole('button', { name: 'Šablóna Prázdne pravidlo' }));
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Nové pravidlo' });
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
    expect(await client.listAutomations()).toHaveLength(4);
    backToList(sheet);
    expect(within(row(sheet, 'Faktúry')).getByText('Neuložené')).toBeDefined();
    expect(within(row(sheet, 'Faktúry')).queryByRole('button', { name: /^Presunúť/ })).toBeNull();

    const reopened = openRule(sheet, 'Faktúry');
    expect(within(reopened).getByRole('status')).toBeDefined();
    change(within(condition(reopened, 1)).getByLabelText('Typ podmienky'), 'fromDomain');
    const domain = within(condition(reopened, 1)).getByLabelText('Doména');
    change(domain, 'firma.sk');
    act(() => {
      fireEvent.keyDown(domain, { key: 'Enter' });
    });

    await waitFor(async () => {
      expect(await stored(client, 'Faktúry')).toMatchObject({
        accountId: null,
        enabled: true,
        conditions: [{ type: 'fromDomain', domain: 'firma.sk' }],
        actions: [{ type: 'task' }],
        ai: { runner: 'claude', model: null, effort: null, instructions: null },
      });
    });
    expect(within(sheet).getByRole('region', { name: 'Pravidlo Faktúry' })).toBeDefined();
    expect(within(sheet).queryByRole('status')).toBeNull();
  });

  it('adds recipient and attachment conditions', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(within(tibor).getByRole('button', { name: '+ Pridať podmienku' }));
    const recipient = condition(tibor, 2);
    change(within(recipient).getByLabelText('Typ podmienky'), 'recipient');
    change(within(recipient).getByLabelText('Pole'), 'cc');
    const value = within(recipient).getByLabelText('Adresa alebo doména');
    change(value, '@firma.sk');
    act(() => {
      fireEvent.blur(value);
    });
    await settle();
    click(within(tibor).getByRole('button', { name: '+ Pridať podmienku' }));
    change(within(condition(tibor, 3)).getByLabelText('Typ podmienky'), 'hasAttachment');
    await settle();

    expect((await stored(client, 'Tibor'))?.conditions).toEqual([
      { type: 'fromAddress', address: 'tibor@codevo.app' },
      { type: 'recipient', field: 'cc', match: 'domain', value: 'firma.sk' },
      { type: 'hasAttachment' },
    ]);
    expect(
      within(tibor).getByRole('button', { name: 'Odstrániť podmienku v kópii je firma.sk' }),
    ).toBeDefined();
    expect(screen.queryByText('Doplň podmienku správne.')).toBeNull();
  });
});
