// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient, gate, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openAddForm = async (client: MailClient) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding: true } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const fill = (sheet: HTMLElement, label: string, value: string) => {
  act(() => {
    fireEvent.change(within(sheet).getByLabelText(label), { target: { value } });
  });
};

const fillImap = (sheet: HTMLElement) => {
  fill(sheet, 'E-mail', 'meno@firma.sk');
  fill(sheet, 'Heslo', 'stare-heslo');
  fill(sheet, 'IMAP server', 'imap.firma.sk');
  fill(sheet, 'SMTP server', 'smtp.firma.sk');
};

describe('adding an account', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('drops a connection test result after the password changes', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      testConnection: async (body) => {
        await held.wait();
        return base.testConnection(body);
      },
    };
    const sheet = await openAddForm(client);
    fillImap(sheet);
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Otestovať pripojenie' }));
    });
    fill(sheet, 'Heslo', 'nove-heslo');
    held.open();
    await settle();
    expect(within(sheet).queryByRole('status')).toBeNull();
  });

  it('keeps a freshly opened form when an earlier account creation finishes', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      createAccount: async (body) => {
        await held.wait();
        return base.createAccount(body);
      },
    };
    const sheet = await openAddForm(client);
    fillImap(sheet);
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Pridať účet/ }));
    });
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Zrušiť/ }));
    });
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'accounts', adding: true } });
    });
    fill(sheet, 'E-mail', 'druhy@firma.sk');
    held.open();
    await settle();
    expect(within(sheet).getByRole('heading', { name: 'Pridať účet' })).toBeDefined();
    expect(within(sheet).getByLabelText<HTMLInputElement>('E-mail').value).toBe('druhy@firma.sk');
  });

  it('does not close a new form when Google sign-in finishes after cancel', async () => {
    const base = demoClient();
    const held = gate();
    let created = false;
    const client: MailClient = {
      ...base,
      createAccount: async (body) => {
        const account = await base.createAccount(body);
        created = true;
        return account;
      },
      listAccounts: async () => {
        if (created) {
          await held.wait();
        }
        return base.listAccounts();
      },
    };
    const sheet = await openAddForm(client);
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Prihlásiť cez Google' }));
    });
    await settle();
    expect(created).toBe(true);
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Zrušiť prihlásenie cez Google' }));
    });
    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: /^Zrušiť/ }));
    });
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'accounts', adding: true } });
    });
    fill(sheet, 'E-mail', 'druhy@firma.sk');
    held.open();
    await settle();
    expect(within(sheet).getByRole('heading', { name: 'Pridať účet' })).toBeDefined();
    expect(within(sheet).getByLabelText<HTMLInputElement>('E-mail').value).toBe('druhy@firma.sk');
  });
});
