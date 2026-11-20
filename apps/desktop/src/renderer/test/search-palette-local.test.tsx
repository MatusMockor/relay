// @vitest-environment jsdom
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { useUiStore } from '../src/state/ui-store';
import { type Gate, gate } from './support/gate';
import { resetStores } from './support/render-app';
import {
  advance,
  LOCAL_DPH,
  openPalette,
  optionsIn,
  palette,
  pressInPalette,
  section,
  setOnline,
  startSearch,
  typeQuery,
} from './support/search-palette';

const slowAndFailing =
  (held: Gate) =>
  (client: MailClient): MailClient => ({
    ...client,
    listThreads: (params) => {
      if (params.q === 'Obed') {
        return held.wait().then(() => client.listThreads(params));
      }
      if (params.q === 'chyba') {
        return Promise.reject(new Error('Lokálna databáza neodpovedá'));
      }
      return client.listThreads(params);
    },
  });

describe('search palette local results', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
    resetStores();
  });

  it('does not offer the rows of the previous query while the new one is loading', async () => {
    const held = gate();
    await startSearch({ connect: slowAndFailing(held) });
    openPalette();
    typeQuery('DPH');
    await advance(0);
    expect(optionsIn('Maily')).toHaveLength(1);

    typeQuery('Obed');
    await advance(0);
    expect(optionsIn('Maily')).toHaveLength(0);
    expect(section('Maily').getAttribute('aria-busy')).toBe('true');
    expect(section('Maily').textContent).toContain('hľadám…');
    pressInPalette('Enter');
    expect(useUiStore.getState().overlay?.kind).toBe('search');
    expect(useUiStore.getState().openThreadId).toBeNull();

    held.open();
    await advance(0);
    const texts = optionsIn('Maily').map((row) => row.textContent);
    expect(texts.some((text) => text.includes('Obed v piatok?'))).toBe(true);
    expect(texts.some((text) => text.includes(LOCAL_DPH))).toBe(false);
    expect(section('Maily').getAttribute('aria-busy')).toBe('false');
  });

  it('shows an error instead of stale rows when the local lookup fails', async () => {
    await startSearch({ connect: slowAndFailing(gate()) });
    openPalette();
    typeQuery('DPH');
    await advance(0);
    typeQuery('chyba');
    await advance(0);

    expect(optionsIn('Maily')).toHaveLength(0);
    expect(within(palette()).getByRole('alert').textContent).toBe(
      'Lokálne hľadanie zlyhalo. Skús to znova.',
    );
    pressInPalette('Enter');
    expect(useUiStore.getState().openThreadId).toBeNull();
  });
});
