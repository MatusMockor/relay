// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopeForDigit } from '../src/features/keyboard/key-handlers';
import { centerRect } from '../src/features/folders/rect';
import { MOD } from '../src/lib/platform-keys';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const start = async () => {
  const client = demoClient();
  const accounts = await client.listAccounts();
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return accounts;
};

const openMenu = () => {
  act(() => {
    setUi({ overlay: { kind: 'accounts', anchor: centerRect() } });
  });
  return within(screen.getByRole('menu')).getAllByRole('menuitemradio');
};

const nameOf = (item: HTMLElement): string =>
  item.querySelector('.lb')?.firstChild?.textContent ?? '';
const keyOf = (item: HTMLElement): string | null => item.querySelector('.kbd')?.textContent ?? null;

const digit = (value: number) =>
  press(String(value), { metaKey: true, code: `Digit${String(value)}` }, document.body);

describe('account order and digit shortcuts', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lists the accounts first and Všetky účty last with matching shortcuts', async () => {
    const accounts = await start();
    const items = openMenu();

    expect(items.map(nameOf)).toEqual([
      ...accounts.map((account) => account.displayName),
      'Všetky účty',
    ]);
    expect(items.map(keyOf)).toEqual([
      ...accounts.map((_, index) => `${MOD}${String(index + 1)}`),
      `${MOD}0`,
    ]);
  });

  it('selects the first account with mod+1 and all accounts with mod+0', async () => {
    const accounts = await start();
    const [first, second] = accounts;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    digit(1);
    expect(useUiStore.getState().scope).toBe(first?.id);
    digit(2);
    expect(useUiStore.getState().scope).toBe(second?.id);
    digit(0);
    expect(useUiStore.getState().scope).toBe('all');
  });

  it('offers the account commands in the palette with Všetky účty last on mod+0', async () => {
    const accounts = await start();
    press('k', { ctrlKey: true }, document.body);
    const palette = screen.getByRole('dialog', { name: 'Príkazy' });
    act(() => {
      fireEvent.change(within(palette).getByRole('textbox'), { target: { value: 'Účet:' } });
    });
    const scopes = [...palette.querySelectorAll<HTMLElement>('.pi')].filter(
      (item) => item.querySelector('.lb')?.textContent.startsWith('Účet:') ?? false,
    );

    expect(scopes.map((item) => item.querySelector('.kbd')?.textContent ?? null)).toEqual([
      ...accounts.map((_, index) => `${MOD}${String(index + 1)}`),
      `${MOD}0`,
    ]);
    expect(scopes.at(-1)?.textContent).toContain('Všetky účty');
  });

  it('maps digits to accounts in list order and skips all accounts for a single account', () => {
    expect(scopeForDigit(1, ['a', 'b'])).toBe('a');
    expect(scopeForDigit(2, ['a', 'b'])).toBe('b');
    expect(scopeForDigit(3, ['a', 'b'])).toBeNull();
    expect(scopeForDigit(0, ['a', 'b'])).toBe('all');
    expect(scopeForDigit(0, ['a'])).toBeNull();
    expect(scopeForDigit(1, ['a'])).toBe('a');
  });
});
