// @vitest-environment jsdom
import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from './support/render-app';
import {
  addThread,
  advance,
  openPalette,
  optionsIn,
  palette,
  pressInPalette,
  searchBox,
  setOnline,
  startSearch,
  typeQuery,
} from './support/search-palette';

const withMoreDph = startSearch.bind(null, {
  seed: (state) => {
    addThread(state, 'dph-10', { subject: 'DPH 10/2026 - podklady' });
  },
});

describe('search palette combobox', () => {
  const scroll = vi.fn<(options?: boolean | ScrollIntoViewOptions) => void>();

  beforeEach(() => {
    resetStores();
    scroll.mockClear();
    HTMLElement.prototype.scrollIntoView = scroll;
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
    resetStores();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it('links the input to the results and to the highlighted option', async () => {
    await withMoreDph();
    openPalette();
    expect(searchBox().getAttribute('aria-expanded')).toBe('false');

    typeQuery('DPH');
    await advance(0);
    const box = searchBox();
    const list = within(palette()).getByRole('listbox', { name: 'Výsledky hľadania' });
    const rows = optionsIn('Maily');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(box.getAttribute('aria-controls')).toBe(list.id);
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(box.getAttribute('aria-activedescendant')).toBe(rows[0]?.id);

    pressInPalette('ArrowDown');
    expect(box.getAttribute('aria-activedescendant')).toBe(rows[1]?.id);
    expect(rows[1]?.getAttribute('aria-selected')).toBe('true');
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });

  it('scrolls the option reached with the arrows into view but not a hovered one', async () => {
    await withMoreDph();
    openPalette();
    typeQuery('DPH');
    await advance(0);
    const rows = optionsIn('Maily');

    pressInPalette('ArrowDown');
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scroll.mock.contexts.at(-1)).toBe(rows[1]);

    const calls = scroll.mock.calls.length;
    act(() => {
      fireEvent.mouseMove(rows[0] ?? palette());
    });
    expect(rows[0]?.getAttribute('aria-selected')).toBe('true');
    expect(scroll.mock.calls).toHaveLength(calls);
  });
});
