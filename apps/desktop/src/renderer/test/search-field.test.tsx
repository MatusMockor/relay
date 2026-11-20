// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { DemoState } from '../src/data/demo/demo-state';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { demoIds } from '../src/data/demo/seed/ids';
import { resultCount } from '../src/lib/text';
import { useUiStore } from '../src/state/ui-store';
import { press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const TOKEN = 'Kvartálny';

const seedMatches = (state: DemoState, count: number): void => {
  const original = [...state.threads.values()].find(
    (record) => record.summary.state === 'inbox' && record.summary.splitIds.length === 0,
  );
  expect(original).toBeDefined();
  if (original === undefined) {
    return;
  }
  Array.from({ length: count }, (_, index) => {
    const id = demoIds.thread(`search-${String(index)}`);
    state.threads.set(id, {
      ...original,
      summary: { ...original.summary, id, subject: `${TOKEN} report ${String(index)}` },
    });
    return id;
  });
};

const start = async (matches: number) => {
  const state = buildDemoState(new Date());
  seedMatches(state, matches);
  renderApp({ demo: () => createDemoMailClient({ aiStepMs: 0, state }) });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
};

const field = (): HTMLElement => {
  const all = document.querySelectorAll<HTMLElement>('.srch');
  expect(all).toHaveLength(1);
  const [only] = all;
  expect(only).toBeDefined();
  return only ?? document.body;
};

const input = () => screen.getByRole('textbox', { name: 'Hľadať v zozname' });

const openWithSlash = () => {
  press('/', {}, document.body);
  return input();
};

const type = (value: string) => {
  act(() => {
    fireEvent.change(input(), { target: { value } });
  });
};

describe('top bar search field', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('keeps one element with the same class while closed, focused and typing', async () => {
    await start(3);
    const closed = field();
    expect(closed.className).toBe('srch');
    expect(closed.querySelector('.srch-key')?.textContent).toBe('/');
    expect(document.querySelector('.qbox')).toBeNull();

    const box = openWithSlash();
    expect(document.activeElement).toBe(box);
    expect(box.getAttribute('placeholder')).toBe('Hľadať v zozname…');
    expect(field()).toBe(closed);
    expect(closed.classList.contains('srch')).toBe(true);
    expect(closed.classList.contains('open')).toBe(true);
    expect(closed.querySelector('.srch-key')?.textContent).toBe('Esc');

    type(TOKEN);
    expect(field()).toBe(closed);
    expect(closed.querySelector('.srch-key')).toBeNull();

    press('Escape', {}, input());
    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(useUiStore.getState().query).toBe('');
    expect(field()).toBe(closed);
    expect(closed.className).toBe('srch');
  });

  it('closes on blur with an empty query and stays open with a query', async () => {
    await start(3);
    const box = openWithSlash();
    type(TOKEN);
    act(() => {
      box.blur();
    });
    expect(useUiStore.getState().searchOpen).toBe(true);

    type('');
    act(() => {
      input().focus();
    });
    act(() => {
      input().blur();
    });
    expect(useUiStore.getState().searchOpen).toBe(false);
  });

  it('clears the query with the clear button and keeps the focus in the field', async () => {
    await start(3);
    openWithSlash();
    type(TOKEN);
    const clear = screen.getByRole('button', { name: 'Vymazať hľadanie' });

    act(() => {
      fireEvent.mouseDown(clear);
      fireEvent.click(clear);
    });

    expect(useUiStore.getState().query).toBe('');
    expect(useUiStore.getState().searchOpen).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(screen.queryByRole('button', { name: 'Vymazať hľadanie' })).toBeNull();
    expect(field().querySelector('.srch-key')?.textContent).toBe('Esc');
  });

  it('shows the result count when the list holds every match', async () => {
    await start(3);
    openWithSlash();
    type(TOKEN);

    await waitFor(() => {
      expect(field().querySelector('.srch-count')?.textContent).toBe('3 výsledky');
    });
  });

  it('leaves the count out when the list has more pages than it loaded', async () => {
    await start(205);
    openWithSlash();
    type(TOKEN);

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(50);
      expect(options.every((option) => option.textContent.includes(TOKEN))).toBe(true);
    });
    expect(field().querySelector('.srch-count')).toBeNull();
    expect(screen.getByRole('button', { name: 'Vymazať hľadanie' })).toBeDefined();
  });

  it('pluralises the result count in Slovak', () => {
    expect([0, 1, 2, 4, 5, 12].map(resultCount)).toEqual([
      '0 výsledkov',
      '1 výsledok',
      '2 výsledky',
      '4 výsledky',
      '5 výsledkov',
      '12 výsledkov',
    ]);
  });
});
