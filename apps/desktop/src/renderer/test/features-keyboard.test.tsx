// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { centerRect } from '../src/features/folders/rect';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const start = async () => {
  renderApp({ demo: demoClient });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

describe('keyboard on focused controls', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('lets Enter activate the focused add button in the account menu', async () => {
    await start();
    const scope = useUiStore.getState().scope;
    act(() => {
      setUi({ overlay: { kind: 'accounts', anchor: centerRect() } });
    });
    const menu = screen.getByRole('menu');
    const add = within(menu).getByRole('menuitem', { name: /Pridať účet/ });
    act(() => {
      add.focus();
    });
    expect(press('Enter', {}, add)).toBe(true);
    expect(screen.getByRole('menu')).toBeDefined();
    expect(useUiStore.getState().scope).toBe(scope);
  });

  it('lets Tab move focus away from a focused button instead of switching folders', async () => {
    await start();
    const before = useUiStore.getState().folder;
    const button = screen.getByRole('button', { name: /Zobraziť priečinky|Skryť priečinky/ });
    act(() => {
      button.focus();
    });
    expect(press('Tab', {}, button)).toBe(true);
    expect(useUiStore.getState().folder).toEqual(before);
  });

  it('switches folders with Tab when no control has focus', async () => {
    await start();
    const before = useUiStore.getState().folder;
    expect(press('Tab', {}, document.body)).toBe(false);
    expect(useUiStore.getState().folder).not.toEqual(before);
  });

  it('lets Enter activate a focused palette button instead of the highlighted item', async () => {
    await start();
    press('k', { ctrlKey: true }, document.body);
    const palette = screen.getByRole('dialog', { name: 'Príkazy' });
    const buttons = within(palette).getAllByRole('button');
    const other = buttons[buttons.length - 1] ?? document.body;
    act(() => {
      other.focus();
    });
    expect(press('Enter', {}, other)).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
  });

  it('lets Enter activate a focused reminder preset instead of the first one', async () => {
    await start();
    press('h', {}, document.body);
    const picker = screen.getByRole('dialog');
    const presets = within(picker).getAllByRole('button');
    const last = presets[presets.length - 1] ?? document.body;
    act(() => {
      last.focus();
    });
    expect(press('Enter', {}, last)).toBe(true);
    expect(within(picker).getByRole('textbox', { name: 'Vlastný čas' })).toBeDefined();
    expect(screen.getByRole('dialog')).toBe(picker);
  });
});
