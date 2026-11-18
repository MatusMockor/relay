// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { threadItem } from '../src/features/mail/list-items';
import { rowActionLabels } from '../src/features/shell/RowActions';
import { setUi, useUiStore } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';
import { serverThread } from './support/thread-fixtures';

const sidebar = () => screen.getByRole('navigation', { name: 'Priečinky' });
const group = (name: string) => within(sidebar()).getByRole('region', { name });
const listSubjects = () =>
  within(screen.getByRole('listbox', { name: 'Konverzácie' }))
    .getAllByRole('option')
    .map((row) => row.querySelector('.subj')?.textContent.trim() ?? '');

const click = (element: HTMLElement) => {
  act(() => {
    fireEvent.click(element);
  });
};

describe('custom folders and labels in the sidebar', () => {
  beforeEach(() => {
    resetStores();
    setUi({ leftUser: true });
  });
  afterEach(() => {
    resetStores();
  });

  it('shows an IMAP folder tree and lists the threads of a nested folder', async () => {
    renderApp();
    const efabrica = await waitFor(() => group('eFabrica'));
    expect(within(efabrica).getByText('Priečinky')).toBeDefined();
    expect(within(efabrica).getByText('Klienti')).toBeDefined();
    expect(within(efabrica).queryByText('Staré')).toBeNull();
    const beta = await within(efabrica).findByRole('button', { name: /Beta/ });
    expect(beta.querySelector('.n')?.textContent).toBe('1');

    click(beta);

    expect(await screen.findByRole('heading', { name: /Beta/ })).toBeDefined();
    await waitFor(() => {
      expect(listSubjects()).toEqual(['Beta: návrh architektúry na pripomienkovanie']);
    });
  });

  it('shows the empty state for a folder without threads', async () => {
    renderApp();
    const efabrica = await waitFor(() => group('eFabrica'));
    click(await within(efabrica).findByRole('button', { name: 'Projekty' }));

    expect(await screen.findByText('Priečinok je prázdny')).toBeDefined();
  });

  it('collapses a folder subtree and remembers it', async () => {
    renderApp();
    const efabrica = await waitFor(() => group('eFabrica'));
    await within(efabrica).findByRole('button', { name: /Alfa/ });

    click(within(efabrica).getByRole('button', { name: 'Zbaliť Projekty' }));

    expect(within(efabrica).queryByRole('button', { name: /Alfa/ })).toBeNull();
    expect(useUiStore.getState().collapsed[`mbx:${demoIds.account('efa')}:Projekty`]).toBe(true);
    expect(window.localStorage.getItem('relay.layout')).toContain('Projekty');
  });

  it('shows Gmail labels as a tree and lists archived threads with that label', async () => {
    renderApp();
    const personal = await waitFor(() => group('Osobný'));
    expect(within(personal).getByText('Štítky')).toBeDefined();
    expect(within(personal).queryByText('Priečinky')).toBeNull();
    expect(within(personal).queryByText('Starred')).toBeNull();

    click(await within(personal).findByRole('button', { name: 'Acme' }));

    expect(await screen.findByRole('heading', { name: /Klienti\/Acme/ })).toBeDefined();
    await waitFor(() => {
      expect(listSubjects()).toEqual(['Acme: podpísaná zmluva']);
    });
  });

  it('shows the folders of a single account even if its group was collapsed under all accounts', async () => {
    const accountId = demoIds.account('efa');
    renderApp();
    const efabrica = await waitFor(() => group('eFabrica'));
    await within(efabrica).findByRole('button', { name: /Faktúry/ });
    click(within(efabrica).getByRole('button', { name: 'eFabrica', expanded: true }));
    expect(useUiStore.getState().collapsed[`acct:${accountId}`]).toBe(true);
    expect(within(efabrica).queryByText('Priečinky')).toBeNull();

    act(() => {
      setUi({ scope: accountId });
    });

    expect(await within(sidebar()).findByRole('button', { name: /Faktúry/ })).toBeDefined();
    expect(within(sidebar()).getByText('Priečinky')).toBeDefined();
  });

  it('ties row actions in folder and label views to each thread state', () => {
    const done = threadItem(serverThread('Zmluva', { state: 'done' }));
    const inbox = threadItem(serverThread('Porada'));

    for (const view of ['mailbox', 'label'] as const) {
      expect(rowActionLabels(view, done, true)).toContain('Vrátiť do Doručenej pošty');
      expect(rowActionLabels(view, done, true)).not.toContain('Hotovo');
      expect(rowActionLabels(view, inbox, true)).toContain('Hotovo');
    }
  });
});
