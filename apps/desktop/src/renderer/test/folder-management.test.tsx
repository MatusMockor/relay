// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { setUi, useUiStore } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';

const sidebar = () => screen.getByRole('navigation', { name: 'Priečinky' });
const group = (name: string) => within(sidebar()).getByRole('region', { name });

const fire = (run: () => void) => {
  act(run);
};

const openMenu = async (scope: HTMLElement, name: string | RegExp) => {
  const row = await within(scope).findByRole('button', { name });
  fire(() => {
    fireEvent.contextMenu(row, { clientX: 40, clientY: 200 });
  });
  return screen.getByRole('menu');
};

const choose = (menu: HTMLElement, item: string) => {
  fire(() => {
    fireEvent.click(within(menu).getByRole('menuitem', { name: item }));
  });
};

const typeName = (input: HTMLElement, value: string) => {
  fire(() => {
    fireEvent.change(input, { target: { value } });
  });
  fire(() => {
    fireEvent.submit(input);
  });
};

const toastText = () =>
  screen
    .getAllByRole('status')
    .map((element) => element.textContent)
    .join(' ');

const paths = async (client: MailClient, account: string) =>
  (await client.listMailboxes(demoIds.account(account))).map((mailbox) => mailbox.path);

describe('managing folders from the sidebar', () => {
  let client: MailClient;

  beforeEach(() => {
    resetStores();
    setUi({ leftUser: true });
    client = createDemoMailClient({ aiStepMs: 0 });
  });
  afterEach(() => {
    resetStores();
  });

  it('creates a top-level folder from the Priečinky header', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));

    fire(() => {
      fireEvent.click(within(efabrica).getByRole('button', { name: 'Nový priečinok v eFabrica' }));
    });
    typeName(within(efabrica).getByRole('textbox', { name: 'Nový priečinok' }), 'Zmluvy');

    expect(await within(efabrica).findByRole('button', { name: 'Zmluvy' })).toBeDefined();
    expect(await paths(client, 'efa')).toContain('Zmluvy');
  });

  it('creates a subfolder and renames a folder from its context menu', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));
    setUi({
      folder: {
        kind: 'mailbox',
        mailboxId: demoIds.folder('efa', 'faktury'),
        accountId: demoIds.account('efa'),
      },
    });

    choose(await openMenu(efabrica, 'Projekty'), 'Nový podpriečinok');
    typeName(within(efabrica).getByRole('textbox', { name: 'Nový podpriečinok' }), 'Gama');
    expect(await within(efabrica).findByRole('button', { name: 'Gama' })).toBeDefined();

    choose(await openMenu(efabrica, /Faktúry/), 'Premenovať');
    const input = within(efabrica).getByRole('textbox', { name: 'Premenovať Faktúry' });
    expect((input as HTMLInputElement).value).toBe('Faktúry');
    typeName(input, 'Účty');

    expect(await within(efabrica).findByRole('button', { name: /Účty/ })).toBeDefined();
    expect(within(efabrica).queryByRole('button', { name: /Faktúry/ })).toBeNull();
    expect(await paths(client, 'efa')).toEqual(expect.arrayContaining(['Projekty/Gama', 'Účty']));
    expect(useUiStore.getState().folder).toMatchObject({
      kind: 'mailbox',
      mailboxId: demoIds.folder('efa', 'faktury'),
    });
  });

  it('moves a folder under another one', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));

    choose(await openMenu(efabrica, /Faktúry/), 'Presunúť do…');
    const picker = screen.getByRole('menu', { name: 'Presunúť Faktúry' });
    expect(within(picker).getByRole('menuitem', { name: 'Projekty / Alfa' })).toBeDefined();
    choose(picker, 'Projekty');

    await waitFor(async () => {
      expect(await paths(client, 'efa')).toContain('Projekty/Faktúry');
    });
  });

  it('asks before deleting a folder and moves its mail to the trash', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));

    choose(await openMenu(efabrica, /Beta/), 'Zmazať');
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Zmazať priečinok „Beta“?')).toBeDefined();
    expect(within(dialog).getByText('Správy sa presunú do Koša.')).toBeDefined();
    fire(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /Zmazať/ }));
    });

    await waitFor(() => {
      expect(within(efabrica).queryByRole('button', { name: /Beta/ })).toBeNull();
    });
    expect(toastText()).toContain('Priečinok „Beta“ je zmazaný');
    const trash = await client.listThreads({ view: 'trash' });
    expect(trash.items.map((thread) => thread.subject)).toContain(
      'Beta: návrh architektúry na pripomienkovanie',
    );
  });

  it('shows the server error when a folder cannot be deleted', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));

    choose(await openMenu(efabrica, 'Projekty'), 'Zmazať');
    fire(() => {
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: /Zmazať/ }),
      );
    });

    await waitFor(() => {
      expect(toastText()).toContain('obsahuje podpriečinky');
    });
    expect(await paths(client, 'efa')).toContain('Projekty');
  });

  it('deletes a Gmail label and keeps its mail', async () => {
    renderApp({ demo: () => client });
    const personal = await waitFor(() => group('Osobný'));

    choose(await openMenu(personal, 'Acme'), 'Zmazať');
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Zmazať štítok „Acme“?')).toBeDefined();
    expect(within(dialog).getByText('Správy ostanú v Archíve.')).toBeDefined();
    fire(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /Zmazať/ }));
    });

    await waitFor(() => {
      expect(within(personal).queryByRole('button', { name: 'Acme' })).toBeNull();
    });
    expect(await paths(client, 'os')).not.toContain('Klienti/Acme');
    const labels = await client.listLabels(demoIds.account('os'));
    expect(labels.map((label) => label.name)).not.toContain('Klienti/Acme');
  });
});
