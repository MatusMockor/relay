// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoState } from '../src/data/demo/demo-state';
import { demoIds } from '../src/data/demo/seed/ids';
import { useUiStore } from '../src/state/ui-store';
import { resetStores } from './support/render-app';
import {
  advance,
  openPalette,
  pressInPalette,
  setOnline,
  startReply,
  startSearch,
  typeQuery,
} from './support/search-palette';

const TEXT = 'Ahoj, v piatok o 12:00 idem.';

const savedDrafts = (state: DemoState): number =>
  state.drafts.filter((draft) => draft.body === TEXT).length;

describe('search palette with an unsaved reply', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
    resetStores();
  });

  it('saves the reply as a draft before showing every result in the list', async () => {
    const { state } = await startSearch();
    await startReply(state, demoIds.thread('c-lunch'), TEXT);
    openPalette();
    typeQuery('DPH');
    await advance(0);
    pressInPalette('Enter', { ctrlKey: true });
    await advance(0);

    const ui = useUiStore.getState();
    expect(ui.reply).toBeNull();
    expect(ui.searchOpen).toBe(true);
    expect(savedDrafts(state)).toBe(1);
    expect(screen.getByText('Koncept uložený')).toBeDefined();
  });

  it('saves the reply as a draft before opening a result from another thread', async () => {
    const { state } = await startSearch();
    await startReply(state, demoIds.thread('c-lunch'), TEXT);
    openPalette();
    typeQuery('DPH');
    await advance(0);
    pressInPalette('Enter');
    await advance(0);

    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('fl-dph'));
    expect(useUiStore.getState().reply).toBeNull();
    expect(savedDrafts(state)).toBe(1);
  });

  it('keeps the reply open when the result is the thread being replied to', async () => {
    const { state } = await startSearch();
    await startReply(state, demoIds.thread('fl-dph'), TEXT);
    openPalette();
    typeQuery('DPH');
    await advance(0);
    pressInPalette('Enter');
    await advance(0);

    expect(useUiStore.getState().reply?.text).toBe(TEXT);
    expect(savedDrafts(state)).toBe(0);
  });
});
