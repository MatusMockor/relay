// @vitest-environment jsdom
import type { AutomationInput } from '@relay/shared';
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toAutomationInput } from '../src/data/hooks/use-replace-automations';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, gate, settle } from './features-support';
import {
  backToList,
  change,
  click,
  condition,
  openAutomations,
  openRule,
  stored,
} from './support/automations';
import { resetStores } from './support/render-app';

const APPLY = 'Použiť na maily, ktoré už mám';

const withTibor = async (client: MailClient, update: Partial<AutomationInput>) => {
  const rules = await client.listAutomations();
  await client.replaceAutomations(
    rules.map((rule) =>
      rule.name === 'Tibor' ? { ...toAutomationInput(rule), ...update } : toAutomationInput(rule),
    ),
  );
};

const enter = (element: HTMLElement) => {
  act(() => {
    fireEvent.keyDown(element, { key: 'Enter' });
  });
};

describe('Nastavenia > Automatizácie > rozpísané podmienky', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('blocks applying a rule while a condition is not saved', async () => {
    const sheet = await openAutomations(demoClient());
    const gitlab = openRule(sheet, 'GitLab do Projektov');
    const address = within(condition(gitlab, 1)).getByLabelText('Adresa');

    change(address, 'nie je adresa');
    enter(address);
    await settle();

    expect(within(gitlab).getByRole('button', { name: APPLY })).toHaveProperty('disabled', true);
    expect(within(gitlab).getByText('Najprv dokonči rozpísané podmienky.')).toBeDefined();
    change(address, 'gitlab@firma.sk');

    expect(within(gitlab).getByRole('button', { name: APPLY })).toHaveProperty('disabled', false);
    expect(within(gitlab).queryByText('Najprv dokonči rozpísané podmienky.')).toBeNull();
  });

  it('keeps the focus in a condition row while it saves', async () => {
    const client = demoClient();
    await withTibor(client, {
      conditions: [{ type: 'header', name: 'List-Id', pattern: 'novinky' }],
    });
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');
    const name = within(condition(tibor, 1)).getByLabelText('Hlavička');
    const pattern = within(condition(tibor, 1)).getByLabelText('Obsahuje (regulárny výraz)');

    act(() => {
      name.focus();
    });
    change(name, 'X-Mailer');
    act(() => {
      pattern.focus();
    });
    await settle();

    expect((await stored(client, 'Tibor'))?.conditions).toEqual([
      { type: 'header', name: 'X-Mailer', pattern: 'novinky' },
    ]);
    expect(document.activeElement).toBe(pattern);
    expect(pattern.isConnected).toBe(true);
  });

  it('shows only the saved condition after a draft gets its id', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      replaceAutomations: (inputs) => held.wait().then(() => base.replaceAutomations(inputs)),
    };
    const sheet = await openAutomations(client);
    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
    click(within(sheet).getByRole('button', { name: 'Šablóna Upratať newslettre' }));
    const draft = within(sheet).getByRole('region', { name: 'Pravidlo Newslettre' });
    const domain = within(condition(draft, 1)).getByLabelText('Doména');

    change(domain, 'substack.com');
    enter(domain);
    backToList(sheet);
    const reopened = openRule(sheet, 'Newslettre');
    act(() => {
      held.open();
    });
    await settle();

    expect(await stored(client, 'Newslettre')).toMatchObject({
      conditions: [{ type: 'fromDomain', domain: 'substack.com' }],
    });
    const saved = within(sheet).getByRole('region', { name: 'Pravidlo Newslettre' });
    expect(saved).toBeDefined();
    expect(reopened).toBeDefined();
    expect(within(saved).getAllByRole('group', { name: /^Podmienka / })).toHaveLength(1);
    expect(within(saved).getByRole('button', { name: '+ Pridať podmienku' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('keeps the condition a template asks for when the draft is reopened', async () => {
    const sheet = await openAutomations(demoClient());
    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
    click(within(sheet).getByRole('button', { name: 'Šablóna Upratať newslettre' }));
    backToList(sheet);

    const reopened = openRule(sheet, 'Newslettre');

    expect(within(condition(reopened, 1)).getByLabelText('Typ podmienky')).toHaveProperty(
      'value',
      'fromDomain',
    );
    expect(within(condition(reopened, 1)).getByLabelText('Doména')).toBeDefined();
  });

  it('keeps the focus in a new condition row after it saves', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(within(tibor).getByRole('button', { name: '+ Pridať podmienku' }));
    change(within(condition(tibor, 2)).getByLabelText('Typ podmienky'), 'fromDomain');
    const domain = within(condition(tibor, 2)).getByLabelText('Doména');
    act(() => {
      domain.focus();
    });
    change(domain, 'firma.sk');
    enter(domain);
    await settle();

    expect((await stored(client, 'Tibor'))?.conditions).toContainEqual({
      type: 'fromDomain',
      domain: 'firma.sk',
    });
    expect(document.activeElement).toBe(domain);
    expect(within(tibor).getByRole('button', { name: '+ Pridať podmienku' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
