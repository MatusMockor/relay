// @vitest-environment jsdom
import { pushLayer } from '@relay/ui';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi, useUiStore } from '../src/state/ui-store';
import { openThreadBySubject, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const SUBJECT = 'Obed v piatok?';

const start = async () => {
  renderApp();
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

const backButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Späť' });

const forwardButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Dopredu' });

const click = (button: HTMLButtonElement): void => {
  act(() => {
    fireEvent.click(button);
  });
};

describe('toolbar back and forward buttons', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('starts with nothing to go back or forward to', async () => {
    await start();
    expect(backButton().disabled).toBe(true);
    expect(forwardButton().disabled).toBe(true);
  });

  it('goes back to the list and forward to the thread again', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    const threadId = useUiStore.getState().openThreadId;
    expect(backButton().disabled).toBe(false);
    expect(forwardButton().disabled).toBe(true);
    click(backButton());
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(await screen.findByRole('listbox', { name: 'Konverzácie' })).toBeDefined();
    expect(backButton().disabled).toBe(true);
    expect(forwardButton().disabled).toBe(false);
    click(forwardButton());
    expect(useUiStore.getState().openThreadId).toBe(threadId);
    expect(await screen.findByRole('heading', { level: 1, name: SUBJECT })).toBeDefined();
    expect(forwardButton().disabled).toBe(true);
  });

  it('enables back as soon as the search opens', async () => {
    await start();
    press('/', {}, document.body);
    expect(backButton().disabled).toBe(false);
    click(backButton());
    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(forwardButton().disabled).toBe(false);
  });

  it('disables both buttons while a message is being written', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    act(() => {
      setUi({ overlay: { kind: 'compose', init: {}, scope: 'all' } });
    });
    expect(backButton().disabled).toBe(true);
    click(backButton());
    expect(useUiStore.getState().openThreadId).not.toBeNull();
    act(() => {
      setUi({ overlay: null });
    });
    expect(backButton().disabled).toBe(false);
  });

  it('disables both buttons while the command palette is open', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    press('k', { ctrlKey: true }, document.body);
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
    expect(backButton().disabled).toBe(true);
    expect(forwardButton().disabled).toBe(true);
  });

  it('disables back while another layer is open and enables it when the layer closes', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    let close = (): void => undefined;
    act(() => {
      close = pushLayer(() => undefined);
    });
    expect(backButton().disabled).toBe(true);
    act(() => {
      close();
    });
    expect(backButton().disabled).toBe(false);
  });

  it('shows the shortcut in the tooltip', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    act(() => {
      fireEvent.mouseEnter(backButton());
    });
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Späť');
    expect(tip.textContent).toContain('[');
  });
});
