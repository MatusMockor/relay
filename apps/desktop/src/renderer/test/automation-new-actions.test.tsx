// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { setUi } from '../src/state/ui-store';
import { demoClient, settle } from './features-support';
import {
  change,
  checkbox,
  click,
  openAutomations,
  openRule,
  popover,
  stored,
} from './support/automations';
import { renderApp, resetStores } from './support/render-app';

const FORWARD = 'Preposlať na adresu';

const summary = (region: HTMLElement): string =>
  within(region).getByRole('region', { name: 'Zhrnutie pravidla' }).textContent;

const ruleFromNewsletter = async (): Promise<HTMLElement> => {
  renderApp({ demo: () => demoClient() });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'ruleFromMail', threadId: demoIds.thread('o-newsletter') } });
  });
  const dialog = await screen.findByRole('dialog', { name: 'Nové pravidlo z mailu' });
  await within(dialog).findByRole('group', { name: 'Akcie pravidla' });
  return dialog;
};

const pressed = (dialog: HTMLElement, name: string): string | null =>
  within(dialog).getByRole('button', { name }).getAttribute('aria-pressed');

const submitAddress = (form: HTMLElement, value: string) => {
  change(within(form).getByLabelText('E-mailová adresa na preposlanie'), value);
  act(() => {
    fireEvent.submit(form);
  });
};

describe('Nastavenia > Automatizácie > nové akcie', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('adds a reminder, changes its days and swaps it for archiving', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(checkbox(tibor, 'Pripomenúť o niekoľko dní'));
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toEqual([
      { type: 'task' },
      { type: 'notify' },
      { type: 'remind', afterDays: 3 },
    ]);
    expect(summary(tibor)).toContain('pošle notifikáciu a pripomenie ho o 3 dni.');
    change(within(tibor).getByLabelText('Počet dní do pripomenutia'), '7');
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toContainEqual({
      type: 'remind',
      afterDays: 7,
    });
    expect(checkbox(tibor, 'Pripomenúť o 7 dní')).toHaveProperty('checked', true);
    expect(summary(tibor)).toContain('pripomenie ho o 7 dní.');
    expect(within(tibor).getAllByText('Nahradí pripomenutie')).toHaveLength(2);
    click(checkbox(tibor, 'Archivovať'));
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toEqual([
      { type: 'task' },
      { type: 'notify' },
      { type: 'archive' },
    ]);
  });

  it('turns on an AI reply draft and describes it in the summary', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(checkbox(tibor, 'Pripraviť odpoveď cez AI'));
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toContainEqual({ type: 'draftReply' });
    expect(summary(tibor)).toContain('pripraví koncept odpovede cez AI');
  });

  it('forwards from a chosen account to a validated address and drops it for all accounts', async () => {
    const client = demoClient();
    const sheet = await openAutomations(client);
    const tibor = openRule(sheet, 'Tibor');

    click(checkbox(tibor, FORWARD));
    click(within(popover(FORWARD)).getByRole('button', { name: 'eFabrica' }));
    const form = within(popover(FORWARD)).getByRole('form', { name: FORWARD });
    submitAddress(form, 'nie je adresa');

    expect(within(form).getByRole('alert').textContent).toBe('Zadaj platnú e-mailovú adresu');
    submitAddress(form, 'Meno@efabrica.sk');
    expect(within(form).getByRole('alert').textContent).toBe(
      'Nemôžeš preposielať na adresu vlastného účtu',
    );
    submitAddress(form, 'uctovnicka@firma.sk');
    await settle();

    expect(await stored(client, 'Tibor')).toMatchObject({
      accountId: 'acc-efa',
      actions: [
        { type: 'task' },
        { type: 'notify' },
        { type: 'forward', to: 'uctovnicka@firma.sk' },
      ],
    });
    expect(summary(tibor)).toContain('do účtu eFabrica');
    expect(summary(tibor)).toContain('prepošle ho na uctovnicka@firma.sk.');
    expect(
      within(tibor).getByRole('button', { name: 'Zmeniť adresu: uctovnicka@firma.sk' }),
    ).toBeDefined();
    change(within(tibor).getByLabelText('Účet'), '');
    await settle();

    expect((await stored(client, 'Tibor'))?.actions).toEqual([
      { type: 'task' },
      { type: 'notify' },
    ]);
  });

  it('swaps archiving for the reminder chip in a rule from a mail', async () => {
    const dialog = await ruleFromNewsletter();

    click(within(dialog).getByRole('button', { name: 'Pripomenúť o 3 dni' }));

    expect(pressed(dialog, 'Pripomenúť o 3 dni')).toBe('true');
    expect(pressed(dialog, 'Archivovať')).toBe('false');
    expect(within(dialog).getByRole('status', { name: 'Zhrnutie pravidla' }).textContent).toContain(
      'označí ho ako prečítaný a pripomenie ho o 3 dni.',
    );
  });
});
