// @vitest-environment jsdom
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoState } from '../src/data/demo/demo-state';
import { demoIds } from '../src/data/demo/seed/ids';
import { setUi, useUiStore } from '../src/state/ui-store';
import { resetStores } from './support/render-app';
import {
  addThread,
  advance,
  optionsIn,
  palette,
  pressInPalette,
  searchBox,
  setOnline,
  startReply,
  startSearch,
  typeQuery,
} from './support/search-palette';

const withMoreDph = startSearch.bind(null, {
  seed: (state) => {
    addThread(state, 'dph-10', { subject: 'DPH 10/2026 - podklady' });
  },
});

const pressOn = (target: Element, key: string, init: KeyboardEventInit = {}): void => {
  act(() => {
    fireEvent.keyDown(target, { key, ...init });
  });
};

const openFromComposer = async (state: DemoState): Promise<HTMLTextAreaElement | null> => {
  const area = await startReply(state, demoIds.thread('c-lunch'), 'Ahoj');
  act(() => {
    area?.focus();
  });
  pressOn(area ?? document.body, 'f', { ctrlKey: true, code: 'KeyF' });
  expect(document.activeElement).toBe(searchBox());
  return area;
};

describe('search palette focus', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
    resetStores();
  });

  it('keeps Tab and Shift+Tab inside the palette', async () => {
    const { state } = await startSearch();
    await openFromComposer(state);
    const chips = within(palette()).getAllByRole('button');
    const lastChip = chips.at(-1);

    pressInPalette('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(lastChip);
    pressOn(lastChip ?? palette(), 'Tab');
    expect(document.activeElement).toBe(searchBox());
  });

  it('gives focus back to the reply composer when closed with Escape', async () => {
    const { state } = await startSearch();
    const area = await openFromComposer(state);
    pressInPalette('Escape');

    expect(useUiStore.getState().overlay).toBeNull();
    expect(document.activeElement).toBe(area);
    expect(useUiStore.getState().reply?.text).toBe('Ahoj');
  });

  it('never moves focus onto a result so the keys act on the highlighted one', async () => {
    await withMoreDph();
    act(() => {
      setUi({ overlay: { kind: 'search' } });
    });
    typeQuery('DPH');
    await advance(0);
    const rows = optionsIn('Maily');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.tabIndex < 0 && row.tagName !== 'BUTTON')).toBe(true);
    expect(fireEvent.mouseDown(rows[0] ?? palette())).toBe(false);

    pressInPalette('ArrowDown');
    pressInPalette('Enter');
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('dph-10'));
  });
});
