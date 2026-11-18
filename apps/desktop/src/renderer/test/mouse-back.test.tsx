// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, openThreadBySubject, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const SUBJECT = 'Obed v piatok?';

const start = async () => {
  renderApp({ demo: demoClient });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

const releaseButton = (button: number): boolean => {
  let result = true;
  act(() => {
    result = fireEvent.mouseUp(window, { button });
  });
  return result;
};

describe('mouse back button', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('closes the open thread and shows the list', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    expect(releaseButton(3)).toBe(false);
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: SUBJECT })).toBeNull();
  });

  it.each([0, 1, 2, 4])('keeps the thread open for mouse button %i', async (button) => {
    await start();
    await openThreadBySubject(SUBJECT);
    expect(releaseButton(button)).toBe(true);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: SUBJECT })).toBeDefined();
  });

  it('closes the search when no thread is open', async () => {
    await start();
    press('/', {}, document.body);
    expect(useUiStore.getState().searchOpen).toBe(true);
    releaseButton(3);
    expect(useUiStore.getState().searchOpen).toBe(false);
  });

  it('leaves the thread alone while the command palette is open', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    press('k', { ctrlKey: true }, document.body);
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
  });

  it('leaves the thread alone while a message is being written', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    act(() => {
      setUi({ overlay: { kind: 'compose', init: {}, scope: 'all' } });
    });
    releaseButton(3);
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(useUiStore.getState().overlay?.kind).toBe('compose');
  });

  it('keeps Escape closing the open thread', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    press('Escape', {}, document.body);
    expect(useUiStore.getState().openThreadId).toBeNull();
  });
});
