// @vitest-environment jsdom
import { type Automation, MailboxIdSchema } from '@relay/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { toAutomationInput } from '../src/data/hooks/use-replace-automations';
import { demoClient, settle } from './features-support';
import { backToList, click, openAutomations, openRule } from './support/automations';
import { resetStores } from './support/render-app';

const openSection = openAutomations;

const card = (sheet: HTMLElement, name: string) => {
  const open = within(sheet).queryByRole('region', { name: `Pravidlo ${name}` });
  if (open !== null) {
    return open;
  }
  if (within(sheet).queryByRole('list', { name: 'Pravidlá' }) === null) {
    backToList(sheet);
  }
  return openRule(sheet, name);
};

const popover = (name: string) => screen.getByRole('dialog', { name });

const stored = async (client: MailClient, name: string): Promise<Automation | undefined> =>
  (await client.listAutomations()).find((item) => item.name === name);

const actionLabels = (element: HTMLElement) =>
  within(element)
    .getAllByRole('button', { name: /^Zmeniť akciu / })
    .map((button) => button.textContent);

describe('Nastavenia > Automatizácie > presun a štítky', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('names the folder and the label of a rule', async () => {
    const sheet = await openSection(demoClient());

    await waitFor(() => {
      expect(actionLabels(card(sheet, 'GitLab do Projektov'))).toEqual([
        'Štítok eFabrica',
        'Presunúť do Projekty',
      ]);
    });
  });

  it('moves mail of an account rule into a folder picked from its folders', async () => {
    const client = demoClient();
    const sheet = await openSection(client);

    click(within(card(sheet, 'Jira spomenutia')).getByRole('button', { name: 'Pridať akciu' }));
    click(within(popover('Nová akcia')).getByRole('button', { name: 'Presunúť do priečinka…' }));
    const picker = await within(popover('Nová akcia')).findByRole('group', {
      name: 'Presunúť do priečinka',
    });
    expect(within(picker).getByRole('button', { name: 'Doručená pošta' })).toBeDefined();
    expect(within(picker).queryByRole('button', { name: 'Junk' })).toBeNull();
    click(within(picker).getByRole('button', { name: 'Projekty / Alfa' }));
    await settle();

    expect((await stored(client, 'Jira spomenutia'))?.actions).toEqual([
      { type: 'summary' },
      { type: 'task' },
      { type: 'moveTo', mailboxId: 'mbx-efa-alfa' },
    ]);
    expect(
      within(card(sheet, 'Jira spomenutia')).queryByRole('button', { name: 'Pridať akciu' }),
    ).not.toBeNull();
  });

  it('asks a rule for all accounts to pick an account before a Gmail label', async () => {
    const client = demoClient();
    const sheet = await openSection(client);

    click(within(card(sheet, 'Tibor')).getByRole('button', { name: 'Pridať akciu' }));
    click(within(popover('Nová akcia')).getByRole('button', { name: 'Pridať štítok…' }));
    const accounts = within(popover('Nová akcia')).getByRole('group', {
      name: 'Najprv vyber účet pravidla',
    });
    click(within(accounts).getByRole('button', { name: 'Osobný' }));
    const labels = await within(popover('Nová akcia')).findByRole('group', {
      name: 'Pridať štítok',
    });
    click(within(labels).getByRole('button', { name: 'Rodina' }));
    await settle();

    expect(await stored(client, 'Tibor')).toMatchObject({
      accountId: 'acc-os',
      actions: [{ type: 'task' }, { type: 'notify' }, { type: 'addLabel', labelId: 'lbl-fam' }],
    });
    expect(
      within(card(sheet, 'Tibor')).getByRole('button', { name: 'Účet: Osobný' }),
    ).toBeDefined();
  });

  it('phrases the move as a label move on a Gmail account', async () => {
    const client = demoClient();
    const sheet = await openSection(client);

    click(within(card(sheet, 'Tibor')).getByRole('button', { name: 'Pridať akciu' }));
    click(within(popover('Nová akcia')).getByRole('button', { name: 'Presunúť do priečinka…' }));
    click(within(popover('Nová akcia')).getByRole('button', { name: 'Osobný' }));
    const picker = await within(popover('Nová akcia')).findByRole('group', {
      name: 'Presunúť do štítka',
    });
    click(within(picker).getByRole('button', { name: 'Cestovanie / Taliansko 2026' }));
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toContainEqual({
      type: 'moveTo',
      mailboxId: 'mbx-os-taliansko',
    });
    expect(actionLabels(card(sheet, 'Tibor'))).toContain(
      'Presunúť do štítka Cestovanie / Taliansko 2026',
    );
  });

  it('warns about a folder that no longer exists', async () => {
    const client = demoClient();
    const rules = await client.listAutomations();
    await client.replaceAutomations(
      rules.map((rule) =>
        rule.name === 'GitLab do Projektov'
          ? {
              ...toAutomationInput(rule),
              actions: [{ type: 'moveTo', mailboxId: MailboxIdSchema.parse('mbx-efa-zmazany') }],
            }
          : toAutomationInput(rule),
      ),
    );
    const sheet = await openSection(client);
    const gitlab = card(sheet, 'GitLab do Projektov');

    await waitFor(() => {
      expect(actionLabels(gitlab)).toEqual(['Priečinok už neexistuje']);
    });
    expect(within(gitlab).getByRole('status').textContent).toBe(
      'Cieľ niektorej akcie už neexistuje. Pravidlo ostatné akcie vykoná, túto preskočí.',
    );
  });

  it('applies a rule to existing inbox mail once', async () => {
    const client = demoClient();
    const sheet = await openSection(client);
    const apply = () => {
      click(
        within(card(sheet, 'GitLab do Projektov')).getByRole('button', {
          name: 'Použiť pravidlo GitLab do Projektov aj na existujúce maily',
        }),
      );
    };

    apply();
    await settle();
    expect(screen.getByText('Pravidlo sa použilo na 1 konverzáciu')).toBeDefined();
    apply();
    await settle();

    expect(
      screen.getByText('V doručenej pošte nie je žiadny mail, ktorý spĺňa podmienky'),
    ).toBeDefined();
    expect(
      within(card(sheet, 'Tibor')).queryByRole('button', { name: /aj na existujúce maily$/ }),
    ).toBeNull();
  });
});
