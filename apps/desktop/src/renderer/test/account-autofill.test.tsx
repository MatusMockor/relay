// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openAddForm = async () => {
  const client = demoClient();
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

const toggleOf = (sheet: HTMLElement) =>
  within(sheet).getByRole('button', { name: /Rozšírené nastavenia servera/ });

const valueOf = (sheet: HTMLElement, label: string) =>
  within(sheet).getByLabelText<HTMLInputElement>(label).value;

describe('add account auto-fill', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('keeps the server fields collapsed until the user asks for them', async () => {
    const sheet = await openAddForm();
    const toggle = toggleOf(sheet);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Doplníme podľa e-mailovej adresy');
    expect(sheet.querySelector('#acc-srv')?.hasAttribute('hidden')).toBe(true);

    act(() => {
      fireEvent.click(toggle);
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(sheet.querySelector('#acc-srv')?.hasAttribute('hidden')).toBe(false);
    expect(toggle.getAttribute('aria-controls')).toBe('acc-srv');

    act(() => {
      fireEvent.click(toggle);
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(sheet.querySelector('#acc-srv')?.hasAttribute('hidden')).toBe(true);
  });

  it('labels the IMAP and SMTP ports separately', async () => {
    const sheet = await openAddForm();

    fill(sheet, 'E-mail', 'jana@gmail.com');

    expect(valueOf(sheet, 'Port IMAP')).toBe('993');
    expect(valueOf(sheet, 'Port SMTP')).toBe('465');
  });

  it('replaces auto-filled servers after an incomplete e-mail edit', async () => {
    const sheet = await openAddForm();

    fill(sheet, 'E-mail', 'jana@gmx.de');
    fill(sheet, 'E-mail', 'jana@gmx.d');
    fill(sheet, 'E-mail', 'jana@gmail.com');

    expect(valueOf(sheet, 'IMAP server')).toBe('imap.gmail.com');
    expect(valueOf(sheet, 'SMTP server')).toBe('smtp.gmail.com');
    expect(valueOf(sheet, 'Port SMTP')).toBe('465');
    expect(toggleOf(sheet).textContent).toContain('Gmail');
  });

  it('keeps a port the user picked when only the local part changes', async () => {
    const sheet = await openAddForm();
    fill(sheet, 'E-mail', 'jana@gmx.de');
    expect(valueOf(sheet, 'Port SMTP')).toBe('587');

    fill(sheet, 'Port SMTP', '465');
    fill(sheet, 'E-mail', 'janka@gmx.de');

    expect(valueOf(sheet, 'Port SMTP')).toBe('465');
  });

  it('labels hand-edited servers as custom settings instead of the provider', async () => {
    const sheet = await openAddForm();
    fill(sheet, 'E-mail', 'jana@gmail.com');

    fill(sheet, 'SMTP server', 'relay.firma.sk');

    expect(toggleOf(sheet).textContent).toContain('Vlastné nastavenia');
    expect(toggleOf(sheet).textContent).not.toContain('Gmail');
  });

  it('fills the Gmail servers from the e-mail domain and names the provider', async () => {
    const sheet = await openAddForm();

    fill(sheet, 'E-mail', 'jana@gmail.com');

    expect(valueOf(sheet, 'IMAP server')).toBe('imap.gmail.com');
    expect(valueOf(sheet, 'SMTP server')).toBe('smtp.gmail.com');
    expect(toggleOf(sheet).textContent).toContain('Gmail');
    expect(toggleOf(sheet).textContent).toContain('imap.gmail.com:993 · smtp.gmail.com:465');
  });

  it('switches the servers when the domain changes to another known provider', async () => {
    const sheet = await openAddForm();

    fill(sheet, 'E-mail', 'jana@gmail.com');
    fill(sheet, 'E-mail', 'jana@seznam.cz');

    expect(valueOf(sheet, 'IMAP server')).toBe('imap.seznam.cz');
    expect(toggleOf(sheet).textContent).toContain('Seznam.cz');
  });

  it('marks a guess for an unknown domain as derived from the domain', async () => {
    const sheet = await openAddForm();

    fill(sheet, 'E-mail', 'peter@firma.sk');

    expect(valueOf(sheet, 'IMAP server')).toBe('imap.firma.sk');
    expect(toggleOf(sheet).textContent).toContain('Podľa domény');
  });

  it('opens the server fields and focuses the field that failed validation', async () => {
    const sheet = await openAddForm();
    fill(sheet, 'E-mail', 'peter@firma.sk');
    fill(sheet, 'Heslo', 'tajne-heslo');
    fill(sheet, 'IMAP server', '');

    act(() => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Pridať účet/ }));
    });

    expect(toggleOf(sheet).getAttribute('aria-expanded')).toBe('true');
    expect(within(sheet).getByRole('alert').textContent).toContain('Doplň IMAP server');
    expect(document.activeElement).toBe(within(sheet).getByLabelText('IMAP server'));
  });

  it('keeps hosts the user typed by hand when the e-mail changes', async () => {
    const sheet = await openAddForm();
    fill(sheet, 'E-mail', 'peter@firma.sk');
    fill(sheet, 'IMAP server', 'mail.firma.sk');

    fill(sheet, 'E-mail', 'peter@firma.cz');

    expect(valueOf(sheet, 'IMAP server')).toBe('mail.firma.sk');
    expect(valueOf(sheet, 'SMTP server')).toBe('smtp.firma.cz');
  });
});
