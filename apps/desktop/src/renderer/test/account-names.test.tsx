// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient, gate, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openAccounts = async (client: MailClient, adding: boolean) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const fill = (sheet: HTMLElement, label: string, value: string) => {
  act(() => {
    fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });
  });
};

describe('account label and sender name', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('edits the sender name without renaming the account', async () => {
    const client = demoClient();
    const [account] = await client.listAccounts();
    const sheet = await openAccounts(client, false);
    const label = `Meno odosielateľa pre ${account?.email ?? ''}`;

    fill(sheet, label, '  Ján Novák ');
    act(() => {
      fireEvent.blur(within(sheet).getByLabelText(label));
    });
    await settle();

    const [updated] = await client.listAccounts();
    expect(updated).toMatchObject({ displayName: account?.displayName, senderName: 'Ján Novák' });
    expect(within(sheet).getByLabelText<HTMLInputElement>(label).value).toBe('Ján Novák');
  });

  it('prefills the sender name of the primary account for a new account', async () => {
    const client = demoClient();
    const sheet = await openAccounts(client, true);
    await waitFor(() => {
      expect(within(sheet).getByLabelText<HTMLInputElement>('Meno odosielateľa').value).toBe(
        'Ján Adamec',
      );
    });

    fill(sheet, 'E-mail', 'meno@firma.sk');
    fill(sheet, 'Heslo', 'heslo');
    fill(sheet, 'IMAP server', 'imap.firma.sk');
    fill(sheet, 'SMTP server', 'smtp.firma.sk');
    fill(sheet, 'Meno odosielateľa', 'Ján Novák');
    fill(sheet, 'Názov účtu (nepovinné)', 'Práca');
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Pridať účet/ }));
    });
    await settle();

    const accounts = await client.listAccounts();
    expect(accounts.find((account) => account.email === 'meno@firma.sk')).toMatchObject({
      displayName: 'Práca',
      senderName: 'Ján Novák',
    });
  });

  it('keeps typing that happens while an earlier name is still saving', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      updateAccount: async (accountId, body) => {
        await held.wait();
        return base.updateAccount(accountId, body);
      },
    };
    const [account] = await base.listAccounts();
    const sheet = await openAccounts(client, false);
    const label = `Meno odosielateľa pre ${account?.email ?? ''}`;
    const input = within(sheet).getByLabelText<HTMLInputElement>(label);

    fill(sheet, label, 'Ján');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    fill(sheet, label, 'Ján Novák');
    held.open();
    await settle();

    expect(input.value).toBe('Ján Novák');
    expect((await base.listAccounts())[0]?.senderName).toBe('Ján');
  });

  it('applies the suggested sender name once the accounts load', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      listAccounts: async () => {
        await held.wait();
        return base.listAccounts();
      },
    };
    renderApp({ demo: () => client });
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'accounts', adding: true } });
    });
    const sheet = await screen.findByRole('dialog', { name: 'Nastavenia' });
    const field = () => within(sheet).getByLabelText<HTMLInputElement>('Meno odosielateľa');
    expect(field().value).toBe('');

    held.open();
    await settle();

    expect(field().value).toBe('Ján Adamec');
  });
});
