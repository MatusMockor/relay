// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { openThread } from '../src/features/mail/navigation';
import { setUi, useUiStore } from '../src/state/ui-store';
import { press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const HTML_SUBJECT = 'Č. 212: CSS anchor positioning v praxi';

const start = async () => {
  renderApp();
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

const overlayKind = () => useUiStore.getState().overlay?.kind ?? null;

const searchDialog = () => screen.queryByRole('dialog', { name: 'Hľadať v pošte' });

describe('search palette shortcuts', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('opens with Cmd+F and focuses the search box', async () => {
    await start();
    expect(press('f', { ctrlKey: true, code: 'KeyF' }, document.body)).toBe(false);

    const dialog = searchDialog();
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(
      within(dialog ?? document.body).getByRole('combobox', { name: 'Hľadať v pošte' }),
    );
  });

  it('opens with the slash key instead of the list filter', async () => {
    await start();
    press('/', {}, document.body);

    expect(overlayKind()).toBe('search');
    expect(useUiStore.getState().searchOpen).toBe(false);
  });

  it('opens when the Hľadať field in the top bar is clicked', async () => {
    await start();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Hľadať/ }));
    });

    expect(searchDialog()).not.toBeNull();
  });

  it('closes with Escape and leaves the list as it was', async () => {
    await start();
    press('f', { ctrlKey: true, code: 'KeyF' }, document.body);
    press('Escape');

    expect(searchDialog()).toBeNull();
    expect(overlayKind()).toBeNull();
    expect(useUiStore.getState().query).toBe('');
  });

  it('keeps the palette open and selects the query on Cmd+F inside it', async () => {
    await start();
    press('f', { ctrlKey: true, code: 'KeyF' }, document.body);
    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Hľadať v pošte' });
    act(() => {
      fireEvent.change(box, { target: { value: 'obed' } });
    });
    press('f', { ctrlKey: true, code: 'KeyF' }, box);

    expect(overlayKind()).toBe('search');
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 4]);
  });

  it('switches to the command palette with Cmd+K and back with its search command', async () => {
    await start();
    press('f', { ctrlKey: true, code: 'KeyF' }, document.body);
    press('k', { ctrlKey: true });
    expect(overlayKind()).toBe('palette');

    const commands = screen.getByRole('textbox', { name: 'Hľadať príkaz' });
    act(() => {
      fireEvent.change(commands, { target: { value: 'hľadať v pošte' } });
    });
    press('Enter', {}, commands);

    expect(overlayKind()).toBe('search');
  });

  it('opens from an HTML mail body with Cmd+F', async () => {
    await start();
    act(() => {
      openThread(demoIds.thread('o-newsletter'));
    });
    const frame = await screen.findByTitle(`Obsah správy: ${HTML_SUBJECT}`);
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    const view = (frame as HTMLIFrameElement).contentWindow;
    expect(view).not.toBeNull();

    await waitFor(() => {
      act(() => {
        fireEvent.keyDown(view ?? window, { key: 'f', code: 'KeyF', ctrlKey: true });
      });
      expect(overlayKind()).toBe('search');
    });
  });

  it('does not open over another overlay', async () => {
    await start();
    act(() => {
      setUi({ overlay: { kind: 'shortcuts' } });
    });
    press('f', { ctrlKey: true, code: 'KeyF' }, document.body);

    expect(overlayKind()).toBe('shortcuts');
  });
});
