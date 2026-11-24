// @vitest-environment jsdom
import { supportedAutomations } from '@relay/shared';
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoClient, settle } from './features-support';
import {
  backToList,
  change,
  click,
  condition,
  openAutomations,
  ruleNames,
  stored,
} from './support/automations';
import { resetStores } from './support/render-app';

const pickTemplate = (sheet: HTMLElement, title: string) => {
  click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
  click(within(sheet).getByRole('button', { name: `Šablóna ${title}` }));
};

describe('Nastavenia > Automatizácie > šablóny', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('offers the templates and goes back without creating a rule', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    click(within(sheet).getByRole('button', { name: '+ Nové pravidlo' }));
    expect(
      within(sheet)
        .getAllByRole('button', { name: /^Šablóna / })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Šablóna Úlohy z Jiry',
      'Šablóna Upratať newslettre',
      'Šablóna Dôležitý odosielateľ',
      'Šablóna Faktúry s prílohou',
      'Šablóna Prázdne pravidlo',
    ]);
    backToList(sheet);

    expect(ruleNames(sheet)).toHaveLength(4);
    expect(supportedAutomations(await client.listAutomations())).toHaveLength(4);
  });

  it('creates a Jira rule from the template', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    pickTemplate(sheet, 'Úlohy z Jiry');
    await settle();

    expect(await stored(client, 'Úlohy z Jiry')).toMatchObject({
      accountId: null,
      enabled: true,
      conditions: [
        { type: 'jira', projectKeys: [] },
        { type: 'jiraEvent', kind: 'assigned' },
      ],
      actions: [{ type: 'task' }],
    });
    const detail = within(sheet).getByRole('region', { name: 'Pravidlo Úlohy z Jiry' });
    expect(within(detail).queryByText('Neuložené')).toBeNull();
    expect(within(detail).queryByRole('status')).toBeNull();
  });

  it('asks for the domain before saving a newsletter rule', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    pickTemplate(sheet, 'Upratať newslettre');
    await settle();
    const detail = within(sheet).getByRole('region', { name: 'Pravidlo Newslettre' });
    const domain = within(condition(detail, 1)).getByLabelText('Doména');
    expect(document.activeElement).toBe(domain);
    expect(within(condition(detail, 1)).getByLabelText('Typ podmienky')).toHaveProperty(
      'value',
      'fromDomain',
    );
    expect(await stored(client, 'Newslettre')).toBeUndefined();

    change(domain, 'substack.com');
    act(() => {
      fireEvent.keyDown(domain, { key: 'Enter' });
    });
    await settle();

    expect(await stored(client, 'Newslettre')).toMatchObject({
      conditions: [{ type: 'fromDomain', domain: 'substack.com' }],
      actions: [{ type: 'markRead' }, { type: 'archive' }],
    });
  });

  it('creates an attachment rule that pins invoices', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);

    pickTemplate(sheet, 'Faktúry s prílohou');
    await settle();

    expect(await stored(client, 'Faktúry')).toMatchObject({
      conditions: [{ type: 'subjectContains', value: 'faktúra' }, { type: 'hasAttachment' }],
      actions: [{ type: 'pin' }],
    });
    expect(within(sheet).queryByRole('heading', { name: 'AI' })).toBeNull();
  });
});
