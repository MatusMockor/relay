// @vitest-environment jsdom
import type { AccountId } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';

const MARK_ALL = 'Označiť všetko ako prečítané';

const sidebar = () => screen.getByRole('navigation', { name: 'Priečinky' });
const group = (name: string) => within(sidebar()).getByRole('region', { name });
const navButton = (name: RegExp) => within(sidebar()).getByRole('button', { name });
const rows = () =>
  within(screen.getByRole('listbox', { name: 'Konverzácie' })).getAllByRole('option');
const menuLabels = () =>
  within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((entry) => entry.textContent);
const toastText = () =>
  screen
    .getAllByRole('status')
    .map((element) => element.textContent)
    .join(' ');

const rightClick = (element: HTMLElement): boolean => {
  let notPrevented = true;
  act(() => {
    notPrevented = fireEvent.contextMenu(element, { clientX: 40, clientY: 200 });
  });
  return notPrevented;
};

const choose = async (label: string) => {
  await act(async () => {
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: label }));
    await Promise.resolve();
  });
};

const unreadByAccount = async (client: MailClient): Promise<Map<AccountId, number>> => {
  const page = await client.listThreads({ view: 'inbox', limit: 500 });
  const counts = new Map<AccountId, number>();
  page.items
    .filter((thread) => thread.unread)
    .forEach((thread) => {
      counts.set(thread.accountId, (counts.get(thread.accountId) ?? 0) + 1);
    });
  return counts;
};

const countOf = (counts: Map<AccountId, number>, account: AccountId | undefined): number =>
  account === undefined ? 0 : (counts.get(account) ?? 0);

const total = (counts: Map<AccountId, number>): number =>
  [...counts.values()].reduce((sum, value) => sum + value, 0);

describe('folder context menu', () => {
  let client: MailClient;

  beforeEach(() => {
    resetStores();
    setUi({ leftUser: true });
    client = createDemoMailClient({ aiStepMs: 0 });
  });
  afterEach(() => {
    resetStores();
  });

  it('marks the whole inbox as read', async () => {
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const unread = total(await unreadByAccount(client));
    expect(unread).toBeGreaterThan(0);
    await waitFor(() => {
      expect(navButton(/Doručená pošta/).querySelector('.n')).not.toBeNull();
    });

    const notPrevented = rightClick(navButton(/Doručená pošta/));
    expect(notPrevented).toBe(false);
    expect(menuLabels()).toEqual([MARK_ALL]);
    await choose(MARK_ALL);

    await waitFor(() => {
      expect(toastText()).toContain(`Označené ako prečítané: ${unread}`);
    });
    await waitFor(() => {
      expect(rows().filter((row) => row.classList.contains('unread'))).toHaveLength(0);
    });
    await waitFor(() => {
      expect(navButton(/Doručená pošta/).querySelector('.n')).toBeNull();
    });

    rightClick(navButton(/Doručená pošta/));
    await choose(MARK_ALL);
    await waitFor(() => {
      expect(toastText()).toContain('Všetko je už prečítané');
    });
  });

  it('keeps the other accounts unread when scoped to one account', async () => {
    const before = await unreadByAccount(client);
    const accounts = [...before.keys()];
    expect(accounts.length).toBeGreaterThan(1);
    const [scoped, other] = accounts;
    expect(scoped).toBeDefined();
    expect(other).toBeDefined();
    setUi({ scope: scoped ?? 'all' });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    rightClick(navButton(/Doručená pošta/));
    await choose(MARK_ALL);

    await waitFor(() => {
      expect(toastText()).toContain(`Označené ako prečítané: ${countOf(before, scoped)}`);
    });
    const after = await unreadByAccount(client);
    expect(countOf(after, scoped)).toBe(0);
    expect(countOf(after, other)).toBe(countOf(before, other));
    expect(countOf(after, other)).toBeGreaterThan(0);
  });

  it('has no menu on drafts', async () => {
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    const notPrevented = rightClick(navButton(/Koncepty/));

    expect(notPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers mark all read and edit items on an IMAP folder', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));
    const row = await within(efabrica).findByRole('button', { name: /Beta/ });
    expect(row.querySelector('.n')?.textContent).toBe('1');

    rightClick(row);
    expect(menuLabels()).toEqual([
      MARK_ALL,
      'Nový podpriečinok',
      'Premenovať',
      'Presunúť do…',
      'Zmazať',
    ]);
    expect(screen.getByRole('menu').querySelectorAll('.sepl')).toHaveLength(1);
    await choose(MARK_ALL);

    await waitFor(() => {
      expect(toastText()).toContain('Označené ako prečítané: 1');
    });
    const beta = await client.listThreads({
      view: 'mailbox',
      mailboxId: demoIds.folder('efa', 'beta'),
    });
    expect(beta.items.map((thread) => thread.unread)).toEqual([false]);
  });

  it('opens the rename editor from the folder menu', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));

    rightClick(await within(efabrica).findByRole('button', { name: /Beta/ }));
    await choose('Premenovať');

    const input = await within(efabrica).findByRole('textbox', { name: 'Premenovať Beta' });
    expect((input as HTMLInputElement).value).toBe('Beta');
  });

  it('offers only mark all read on a non-Gmail label', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));

    rightClick(await within(efabrica).findByRole('button', { name: 'Jira' }));

    expect(menuLabels()).toEqual([MARK_ALL]);
  });
});
