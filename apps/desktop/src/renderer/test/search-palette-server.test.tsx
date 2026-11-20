// @vitest-environment jsdom
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from './support/render-app';
import {
  advance,
  DEBOUNCE_MS,
  openPalette,
  optionsIn,
  palette,
  SERVER_DELAY_MS,
  serverSection,
  setOnline,
  startSearch,
  typeQuery,
} from './support/search-palette';

describe('search palette server section', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
    resetStores();
  });

  it('shows the offline note when the server cannot be reached', async () => {
    await startSearch({ serverSearch: { offline: () => true } });
    openPalette();
    typeQuery('DPH');
    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);

    expect(optionsIn('Maily')).toHaveLength(1);
    expect(serverSection()).toBeNull();
    expect(within(palette()).getByRole('status').textContent).toBe(
      'Si offline. Staršie maily nájdem len podľa odosielateľa a predmetu, text prehľadám po pripojení.',
    );
  });

  it('shows the offline note without asking the server while the device is offline', async () => {
    const { requests } = await startSearch();
    setOnline(false);
    openPalette();
    typeQuery('DPH');
    await advance(0);

    expect(within(palette()).getByRole('status').textContent).toContain('Si offline.');
    expect(optionsIn('Maily')).toHaveLength(1);
    await advance(2_000);
    expect(requests()).toHaveLength(0);
  });

  it('hides the server section when the client cannot search the server', async () => {
    const { requests } = await startSearch({ serverSearch: { status: () => 'unsupported' } });
    openPalette();
    typeQuery('DPH');
    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);
    expect(serverSection()).toBeNull();
    typeQuery('faktúra');
    await advance(0);
    expect(serverSection()).toBeNull();
    await advance(2_000);
    expect(requests()).toHaveLength(1);
  });

  it('hides the server section when the server search is skipped and notes a partial answer', async () => {
    let status: 'skipped' | 'partial' = 'skipped';
    await startSearch({ serverSearch: { status: () => status } });
    openPalette();
    typeQuery('DPH');
    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);
    expect(serverSection()).toBeNull();

    status = 'partial';
    typeQuery('DPH 09');
    await advance(0);
    expect(serverSection()?.getAttribute('aria-busy')).toBe('true');
    await advance(DEBOUNCE_MS + SERVER_DELAY_MS);
    expect(optionsIn('Staršia pošta na serveri')).toHaveLength(1);
    expect(serverSection()?.textContent).toContain('staršia pošta nemusí byť úplná');
  });
});
