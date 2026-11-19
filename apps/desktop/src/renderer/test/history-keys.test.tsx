// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { demoIds } from '../src/data/demo/seed/ids';
import { openThread } from '../src/features/mail/navigation';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, openThreadBySubject, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const SUBJECT = 'Obed v piatok?';
const HTML_SUBJECT = 'Č. 212: CSS anchor positioning v praxi';

const back = (target: Element = document.body): boolean =>
  press('[', { ctrlKey: true, code: 'BracketLeft' }, target);

const forward = (target: Element = document.body): boolean =>
  press(']', { ctrlKey: true, code: 'BracketRight' }, target);

const start = async () => {
  renderApp({ demo: () => demoClient() });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

describe('history keyboard shortcuts', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('goes back and forward with the bracket shortcuts', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    const threadId = useUiStore.getState().openThreadId;

    expect(back()).toBe(false);
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(forward()).toBe(false);
    expect(useUiStore.getState().openThreadId).toBe(threadId);
  });

  it('matches the physical bracket keys on other keyboard layouts', async () => {
    await start();
    await openThreadBySubject(SUBJECT);

    press('ú', { ctrlKey: true, code: 'BracketLeft' }, document.body);

    expect(useUiStore.getState().openThreadId).toBeNull();
  });

  it('ignores the shortcuts while typing', async () => {
    await start();
    act(() => {
      setUi({ folder: { kind: 'view', view: 'sent' } });
    });
    press('/', {}, document.body);
    const field = await screen.findByLabelText('Hľadať v zozname');

    expect(back(field)).toBe(true);

    expect(useUiStore.getState().searchOpen).toBe(true);
    expect(useUiStore.getState().folder).toEqual({ kind: 'view', view: 'sent' });
  });

  it('ignores the brackets without the modifier', async () => {
    await start();
    await openThreadBySubject(SUBJECT);

    press('[', { code: 'BracketLeft' }, document.body);
    press('[', { ctrlKey: true, shiftKey: true, code: 'BracketLeft' }, document.body);

    expect(useUiStore.getState().openThreadId).not.toBeNull();
  });

  it('switches settings sections back and forward', async () => {
    await start();
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
    });
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'look', adding: false } });
    });

    back();
    expect(useUiStore.getState().overlay).toMatchObject({ kind: 'settings', section: 'accounts' });
    forward();
    expect(useUiStore.getState().overlay).toMatchObject({ kind: 'settings', section: 'look' });
  });

  it('leaves the thread alone while the command palette is open', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    press('k', { ctrlKey: true }, document.body);
    const palette = screen.getByRole('dialog', { name: 'Príkazy' });

    back(palette);

    expect(useUiStore.getState().openThreadId).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Príkazy' })).toBeDefined();
  });

  it('lists the shortcuts in the keyboard settings', async () => {
    await start();
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'keys', adding: false } });
    });
    const panel = within(screen.getByRole('dialog', { name: 'Nastavenia' }));

    expect(panel.getByText('Späť')).toBeDefined();
    expect(panel.getByText('Dopredu')).toBeDefined();
  });

  it('ignores the shortcuts while typing inside an HTML mail', async () => {
    await start();
    await openThreadBySubject(SUBJECT);
    act(() => {
      openThread(demoIds.thread('o-newsletter'));
    });
    const frame = await screen.findByTitle(`Obsah správy: ${HTML_SUBJECT}`);
    const view = (frame as HTMLIFrameElement).contentWindow;
    expect(view).not.toBeNull();
    if (view === null) {
      return;
    }
    await waitFor(() => {
      expect(fireEvent.mouseDown(view, { button: 3 })).toBe(false);
    });
    const field = view.document.createElement('input');
    view.document.body.append(field);

    expect(back(field)).toBe(true);
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('o-newsletter'));
    back(view.document.body);
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('c-lunch'));
  });
});
