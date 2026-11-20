// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import { useUiStore } from '../src/state/ui-store';
import { resetStores } from './support/render-app';
import {
  addThread,
  advance,
  chip,
  DASHES,
  DEBOUNCE_MS,
  LOCAL_DPH,
  openPalette,
  optionsIn,
  palette,
  pressInPalette,
  searchBox,
  section,
  selectedText,
  SERVER_DELAY_MS,
  serverSection,
  setOnline,
  startSearch,
  typeQuery,
} from './support/search-palette';

const withMoreDph = startSearch.bind(null, {
  seed: (state) => {
    addThread(state, 'dph-10', { subject: 'DPH 10/2026 - podklady' });
    addThread(state, 'dph-done', { subject: 'DPH potvrdenie o podaní', state: 'done' });
  },
});

describe('search palette', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
    resetStores();
  });

  it('shows the input, the chips and the keys while the query is empty', async () => {
    const { requests } = await startSearch();
    openPalette();

    expect(searchBox().getAttribute('placeholder')).toBe('Hľadať v pošte…');
    expect(document.activeElement).toBe(searchBox());
    expect(chip('Všetko').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Tento priečinok').getAttribute('aria-pressed')).toBe('false');
    expect(palette().textContent).toContain('všetky výsledky v zozname');
    expect(palette().textContent).toContain('Hľadaj podľa odosielateľa, predmetu alebo textu.');
    await advance(2_000);
    expect(requests).toHaveLength(0);
    expect(serverSection()).toBeNull();
  });

  it('shows local results right away and asks the server once after the pause', async () => {
    const { requests } = await startSearch();
    openPalette();
    typeQuery('D');
    await advance(100);
    typeQuery('DP');
    await advance(100);
    typeQuery('DPH');
    await advance(0);

    expect(optionsIn('Maily').map((option) => option.textContent)).toEqual([
      expect.stringContaining(LOCAL_DPH),
    ]);
    expect(section('Maily').textContent).toContain('1 lokálny');
    expect(serverSection()?.getAttribute('aria-busy')).toBe('true');
    expect(serverSection()?.textContent).toContain('hľadám…');
    await advance(DEBOUNCE_MS - 1);
    expect(requests).toHaveLength(0);
    await advance(1);
    expect(requests).toEqual([expect.objectContaining({ q: 'DPH', searchField: undefined })]);
    expect(serverSection()?.getAttribute('aria-busy')).toBe('true');
  });

  it('appends the server hits with a badge and keeps the selection and the local order', async () => {
    await withMoreDph();
    openPalette();
    typeQuery('DPH');
    await advance(0);
    const localOrder = optionsIn('Maily').map((option) => option.textContent);
    expect(localOrder).toHaveLength(3);
    pressInPalette('ArrowDown');
    const selected = selectedText();
    expect(selected).toBe(localOrder[1]);

    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);

    const server = optionsIn('Staršia pošta na serveri');
    expect(server.map((option) => within(option).getByText('server').textContent)).toEqual([
      'server',
      'server',
    ]);
    expect(server[0]?.textContent).toContain('DPH 09/2025');
    expect(server[1]?.textContent).toContain('DPH 08/2025');
    expect(serverSection()?.textContent).toContain('2 výsledky');
    expect(optionsIn('Maily').map((option) => option.textContent)).toEqual(localOrder);
    expect(selectedText()).toBe(selected);
  });

  it('ignores a server answer for a query that is no longer typed', async () => {
    const { requests } = await startSearch();
    openPalette();
    typeQuery('DPH');
    await advance(DEBOUNCE_MS);
    typeQuery('DPH 08');
    await advance(DEBOUNCE_MS);
    expect(requests.map((request) => request.q)).toEqual(['DPH', 'DPH 08']);

    await advance(SERVER_DELAY_MS - DEBOUNCE_MS);
    expect(serverSection()?.getAttribute('aria-busy')).toBe('true');
    expect(palette().textContent).not.toContain('DPH 09/2025');

    await advance(DEBOUNCE_MS);
    expect(optionsIn('Staršia pošta na serveri').map((option) => option.textContent)).toEqual([
      expect.stringContaining('DPH 08/2025'),
    ]);
    expect(section('Maily').textContent).toContain('Lokálne nič pre „DPH 08“.');
  });

  it('opens a local thread and a server hit with Enter', async () => {
    await startSearch();
    openPalette();
    typeQuery('DPH');
    await advance(0);
    pressInPalette('Enter');
    expect(useUiStore.getState().overlay).toBeNull();
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('fl-dph'));

    openPalette();
    typeQuery('DPH');
    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);
    pressInPalette('ArrowDown');
    pressInPalette('Enter');
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('ar-dph-09'));
    await advance(0);
    expect(screen.getByRole('heading', { level: 1, name: 'DPH 09/2025' })).toBeDefined();
  });

  it('shows every local result with the same filters in the list on Cmd+Enter', async () => {
    await withMoreDph();
    openPalette();
    typeQuery('DPH');
    await advance(0);
    pressInPalette('Enter', { ctrlKey: true });

    const ui = useUiStore.getState();
    expect(ui.overlay).toBeNull();
    expect(ui.searchOpen).toBe(true);
    expect(ui.query).toBe('DPH');
    expect(ui.searchFilters?.scope).toBe('everywhere');
    await advance(0);
    const list = screen.getByRole('listbox', { name: 'Konverzácie' });
    const subjects = within(list)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(subjects).toHaveLength(3);
    expect(subjects.some((text) => text.includes('DPH potvrdenie o podaní'))).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Hľadať v zozname' })).toHaveProperty(
      'value',
      'DPH',
    );
  });

  it('maps the chips to the local and the server search', async () => {
    const { requests } = await startSearch({
      seed: (state) => {
        addThread(state, 'dph-unread', { subject: 'DPH neprečítané', unread: true });
      },
    });
    openPalette();
    typeQuery('Hollá');
    await advance(0);
    expect(optionsIn('Maily')).toHaveLength(2);

    act(() => {
      fireEvent.click(chip('Predmet'));
    });
    await advance(0);
    expect(chip('Predmet').getAttribute('aria-pressed')).toBe('true');
    expect(section('Maily').textContent).toContain('Lokálne nič pre „Hollá“.');

    act(() => {
      fireEvent.click(chip('Od'));
      fireEvent.click(chip('Neprečítané'));
    });
    await advance(0);
    expect(optionsIn('Maily').map((option) => option.textContent)).toEqual([
      expect.stringContaining('DPH neprečítané'),
    ]);
    await advance(DEBOUNCE_MS);
    expect(requests.at(-1)).toEqual(
      expect.objectContaining({ q: 'Hollá', searchField: 'from', unread: true }),
    );

    const count = requests.length;
    act(() => {
      fireEvent.click(chip('Tento priečinok'));
    });
    await advance(0);
    expect(chip('Všetko').getAttribute('aria-pressed')).toBe('false');
    expect(serverSection()).toBeNull();
    await advance(2_000);
    expect(requests).toHaveLength(count);
  });

  it('remembers what was searched and runs a recent search again', async () => {
    await startSearch();
    openPalette();
    typeQuery('DPH');
    await advance(0);
    pressInPalette('Enter');
    expect(window.localStorage.getItem('relay.search.recent')).toBe(JSON.stringify(['DPH']));

    openPalette();
    const recent = within(section('Nedávne hľadania')).getAllByRole('option');
    expect(recent.map((option) => option.textContent)).toEqual(['DPH']);
    pressInPalette('Enter');
    expect(searchBox().value).toBe('DPH');
    await advance(0);
    expect(optionsIn('Maily')).toHaveLength(1);
  });

  it('never uses an em or en dash in its copy', async () => {
    await startSearch();
    openPalette();
    const texts = [palette().textContent];
    typeQuery('DPH');
    await advance(0);
    texts.push(palette().textContent);
    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);
    texts.push(palette().textContent);
    typeQuery('nič také');
    await advance(0);
    texts.push(palette().textContent);
    setOnline(false);
    texts.push(palette().textContent);
    texts.forEach((text) => {
      DASHES.forEach((dash) => {
        expect(text).not.toContain(dash);
      });
    });
  });
});
