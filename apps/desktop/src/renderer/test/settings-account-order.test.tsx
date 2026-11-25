// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { INVALIDATION_WINDOW_MS } from '../src/data/hooks/invalidation-batch';
import { dropAccountData } from '../src/data/demo/demo-drafts';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { demoIds } from '../src/data/demo/seed/ids';
import { MOD } from '../src/lib/platform-keys';
import { useToastStore } from '../src/state/toast-store';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const dragData = () => ({
  dataTransfer: {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: () => undefined,
    setDragImage: () => undefined,
  },
});

const openSettings = async (client: MailClient): Promise<HTMLElement> => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
  });
  return screen.getByRole('dialog', { name: 'Nastavenia' });
};

const openAccounts = async (client: MailClient): Promise<HTMLElement> => {
  const sheet = await openSettings(client);
  await within(sheet).findByRole('list', { name: 'Poradie účtov' });
  return sheet;
};

const orderList = (sheet: HTMLElement) =>
  within(sheet).getByRole('list', { name: 'Poradie účtov' });

const shownOrder = (sheet: HTMLElement): string[] =>
  within(orderList(sheet))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.ao-main b')?.textContent ?? '');

const row = (sheet: HTMLElement, name: string) =>
  within(orderList(sheet)).getByRole('listitem', { name: `Účet ${name}` });

const handleOf = (sheet: HTMLElement, name: string) =>
  within(row(sheet, name)).getByRole('button', { name: `Presunúť účet ${name}` });

const storedOrder = async (client: MailClient): Promise<string[]> =>
  (await client.listAccounts()).map((account) => account.displayName);

const demoWithState = () => {
  const state = buildDemoState(new Date());
  return { state, client: createDemoMailClient({ state, aiStepMs: 0 }) };
};

const accountNamed = (state: ReturnType<typeof buildDemoState>, name: string) => {
  const found = state.accounts.find((account) => account.displayName === name);
  expect(found).toBeDefined();
  return { id: found?.id ?? demoIds.account('missing'), email: found?.email ?? '' };
};

describe('Nastavenia > Účty > poradie', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lists the accounts in their order with the matching shortcuts', async () => {
    const sheet = await openAccounts(demoClient());

    expect(shownOrder(sheet)).toEqual(['eFabrica', 'Osobný', 'Freelance']);
    expect(
      within(orderList(sheet))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.kbd')?.textContent ?? null),
    ).toEqual([`${MOD}1`, `${MOD}2`, `${MOD}3`]);
    expect(within(row(sheet, 'eFabrica')).getByText('Hlavný')).toBeDefined();
  });

  it('moves an account with Alt and arrows and the shortcuts follow', async () => {
    const client = demoClient();
    const sheet = await openAccounts(client);
    const handle = handleOf(sheet, 'Freelance');

    act(() => {
      handle.focus();
      fireEvent.keyDown(handle, { key: 'ArrowUp' });
      fireEvent.keyDown(handle, { key: 'ArrowUp', altKey: true });
    });
    await settle();
    act(() => {
      fireEvent.keyDown(handleOf(sheet, 'Freelance'), { key: 'ArrowUp', altKey: true });
    });
    await settle();

    expect(await storedOrder(client)).toEqual(['Freelance', 'eFabrica', 'Osobný']);
    expect(shownOrder(sheet)).toEqual(['Freelance', 'eFabrica', 'Osobný']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Presunúť účet Freelance');
    act(() => {
      setUi({ overlay: null });
    });
    const freelance = (await client.listAccounts())[0];
    press('1', { metaKey: true, code: 'Digit1' }, document.body);
    expect(useUiStore.getState().scope).toBe(freelance?.id);
  });

  it('moves an account by dragging its row', async () => {
    const client = demoClient();
    const sheet = await openAccounts(client);

    act(() => {
      fireEvent.dragStart(handleOf(sheet, 'eFabrica'), dragData());
    });
    act(() => {
      fireEvent.dragOver(row(sheet, 'Freelance'), dragData());
    });
    expect(row(sheet, 'Freelance').className).toContain('drop-below');
    act(() => {
      fireEvent.drop(row(sheet, 'Freelance'), dragData());
    });
    await settle();

    expect(await storedOrder(client)).toEqual(['Osobný', 'Freelance', 'eFabrica']);
    expect(shownOrder(sheet)).toEqual(['Osobný', 'Freelance', 'eFabrica']);
    expect(within(row(sheet, 'eFabrica')).getByText('Hlavný')).toBeDefined();
  });

  it('restores the stored order and explains why when the reorder is rejected', async () => {
    const { state, client } = demoWithState();
    const sheet = await openAccounts(client);
    dropAccountData(state, accountNamed(state, 'Freelance').id);

    act(() => {
      fireEvent.keyDown(handleOf(sheet, 'Osobný'), { key: 'ArrowDown', altKey: true });
    });
    await settle();

    expect(useToastStore.getState().toast?.message).toBe(
      'Poradie musí obsahovať každý účet práve raz',
    );
    expect(shownOrder(sheet)).toEqual(['eFabrica', 'Osobný']);
    expect(await storedOrder(client)).toEqual(['eFabrica', 'Osobný']);
  });

  it('leaves the focus where the user moved it when the list changes later', async () => {
    const { state, client } = demoWithState();
    const sheet = await openAccounts(client);
    const nameInput = within(sheet).getByRole('textbox', {
      name: `Názov účtu ${accountNamed(state, 'Osobný').email}`,
    });
    const handle = handleOf(sheet, 'Osobný');

    act(() => {
      handle.focus();
      fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true });
    });
    await settle();
    expect(document.activeElement).toBe(handleOf(sheet, 'Osobný'));
    act(() => {
      nameInput.focus();
    });
    await client.removeAccount(accountNamed(state, 'Freelance').id);
    await settle(INVALIDATION_WINDOW_MS * 2);

    expect(shownOrder(sheet)).toEqual(['eFabrica', 'Osobný']);
    expect(document.activeElement).toBe(nameInput);
  });

  it('hides the order list with a single account', async () => {
    const { state, client } = demoWithState();
    state.accounts
      .filter((account) => !account.isPrimary)
      .forEach((account) => {
        dropAccountData(state, account.id);
      });
    const sheet = await openSettings(client);
    await within(sheet).findByRole('region', { name: 'eFabrica' });

    expect(within(sheet).queryByRole('list', { name: 'Poradie účtov' })).toBeNull();
  });
});
