// @vitest-environment jsdom
import { MailboxIdSchema } from '@relay/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toAutomationInput } from '../src/data/hooks/use-replace-automations';
import { demoClient, settle } from './features-support';
import {
  backToList,
  checkbox,
  click,
  openAutomations,
  openRule,
  popover,
  row,
  stored,
} from './support/automations';
import { resetStores } from './support/render-app';

const checkedActions = (region: HTMLElement) =>
  within(region)
    .getAllByRole<HTMLInputElement>('checkbox')
    .filter((item) => item.checked)
    .map((item) => item.getAttribute('aria-label'));

const moveTarget = (region: HTMLElement) =>
  within(region).getByRole('button', { name: /^Zmeniť cieľ: / }).textContent;

describe('Nastavenia > Automatizácie > presun a štítky', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('names the folder and the label of a rule', async () => {
    const sheet = await openAutomations(demoClient());

    await waitFor(() => {
      expect(
        within(row(sheet, 'GitLab do Projektov')).getByText(
          'Od gitlab@firma.sk → Štítok eFabrica, Presunúť do Projekty',
        ),
      ).toBeDefined();
    });
    const gitlab = openRule(sheet, 'GitLab do Projektov');
    await waitFor(() => {
      expect(checkedActions(gitlab)).toEqual(['Presunúť do priečinka', 'Štítok eFabrica']);
    });
    expect(moveTarget(gitlab)).toBe('Projekty');
  });

  it('moves mail of an account rule into a folder picked from its folders', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const mentions = openRule(sheet, 'Jira spomenutia');

    click(checkbox(mentions, 'Presunúť do priečinka'));
    const picker = await within(popover('Presunúť do priečinka')).findByRole('group', {
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
    expect(within(mentions).getByText('Nahradí presun')).toBeDefined();
    expect(checkbox(mentions, 'Pridať štítok')).toHaveProperty('disabled', false);
    expect(moveTarget(mentions)).toBe('Projekty / Alfa');
  });

  it('asks a rule for all accounts to pick an account before a Gmail label', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(checkbox(tibor, 'Pridať štítok'));
    const accounts = within(popover('Pridať štítok')).getByRole('group', {
      name: 'Najprv vyber účet pravidla',
    });
    click(within(accounts).getByRole('button', { name: 'Osobný' }));
    const labels = await within(popover('Pridať štítok')).findByRole('group', {
      name: 'Pridať štítok',
    });
    click(within(labels).getByRole('button', { name: 'Rodina' }));
    await settle();

    expect(await stored(client, 'Tibor')).toMatchObject({
      accountId: 'acc-os',
      actions: [{ type: 'task' }, { type: 'notify' }, { type: 'addLabel', labelId: 'lbl-fam' }],
    });
    const scope = within(tibor).getByRole('combobox', { name: 'Účet' });
    expect(within(scope).getByRole<HTMLOptionElement>('option', { name: 'Osobný' }).selected).toBe(
      true,
    );
    expect(checkbox(tibor, 'Štítok Rodina')).toHaveProperty('checked', true);
  });

  it('phrases the move as a label move on a Gmail account', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(checkbox(tibor, 'Presunúť do priečinka'));
    click(within(popover('Presunúť do priečinka')).getByRole('button', { name: 'Osobný' }));
    const picker = await within(popover('Presunúť do priečinka')).findByRole('group', {
      name: 'Presunúť do štítka',
    });
    click(within(picker).getByRole('button', { name: 'Cestovanie / Taliansko 2026' }));
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toContainEqual({
      type: 'moveTo',
      mailboxId: 'mbx-os-taliansko',
    });
    await waitFor(() => {
      expect(checkbox(tibor, 'Presunúť do štítka')).toHaveProperty('checked', true);
    });
    expect(moveTarget(tibor)).toBe('Cestovanie / Taliansko 2026');
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
    const sheet = await openAutomations(client);

    expect(
      await within(row(sheet, 'GitLab do Projektov')).findByText('Cieľ neexistuje'),
    ).toBeDefined();
    const gitlab = openRule(sheet, 'GitLab do Projektov');
    await waitFor(() => {
      expect(moveTarget(gitlab)).toBe('Priečinok už neexistuje');
    });
    expect(within(gitlab).getByRole('status').textContent).toBe(
      'Cieľ niektorej akcie už neexistuje. Pravidlo ostatné akcie vykoná, túto preskočí.',
    );
  });

  it('applies a rule to existing inbox mail once', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const apply = () => {
      click(
        within(sheet).getByRole('button', {
          name: 'Použiť na maily, ktoré už mám',
        }),
      );
    };
    openRule(sheet, 'GitLab do Projektov');

    apply();
    await settle();
    expect(screen.getByText('Pravidlo sa použilo na 1 konverzáciu')).toBeDefined();
    apply();
    await settle();

    expect(
      screen.getByText('V doručenej pošte nie je žiadny mail, ktorý spĺňa podmienky'),
    ).toBeDefined();
    backToList(sheet);
    expect(
      within(openRule(sheet, 'Tibor')).queryByRole('button', {
        name: 'Použiť na maily, ktoré už mám',
      }),
    ).toBeNull();
  });

  it('swaps archiving and moving in one change', async () => {
    const client = demoClient();
    const rules = await client.listAutomations();
    await client.replaceAutomations(
      rules.map((rule) =>
        rule.name === 'GitLab do Projektov'
          ? { ...toAutomationInput(rule), actions: [{ type: 'archive' }] }
          : toAutomationInput(rule),
      ),
    );
    const sheet = await openAutomations(client);
    const gitlab = openRule(sheet, 'GitLab do Projektov');
    const moveBox = checkbox(gitlab, 'Presunúť do priečinka');

    expect(moveBox).toHaveProperty('disabled', false);
    expect(within(gitlab).getByText('Nahradí archiváciu')).toBeDefined();
    click(moveBox);
    const picker = await within(popover('Presunúť do priečinka')).findByRole('group', {
      name: 'Presunúť do priečinka',
    });
    click(within(picker).getByRole('button', { name: 'Projekty / Alfa' }));
    await settle();

    expect((await stored(client, 'GitLab do Projektov'))?.actions).toEqual([
      { type: 'moveTo', mailboxId: 'mbx-efa-alfa' },
    ]);
    expect(checkbox(gitlab, 'Archivovať')).toHaveProperty('disabled', false);
    expect(within(gitlab).getByText('Nahradí presun')).toBeDefined();
    click(checkbox(gitlab, 'Archivovať'));
    await settle();

    expect((await stored(client, 'GitLab do Projektov'))?.actions).toEqual([{ type: 'archive' }]);
  });
});
