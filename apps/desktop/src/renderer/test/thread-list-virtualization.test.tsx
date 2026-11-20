// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { press, settle } from './features-support';
import { bulkDemoState } from './support/bulk-demo-threads';
import {
  optionPositions,
  renderedRows,
  scrollElementOf,
  scrollListTo,
  scrollListToEnd,
  threadListbox,
  waitForRows,
} from './support/list-scroll';
import { setListViewport } from './support/list-geometry';
import { renderApp, resetStores } from './support/render-app';

const NOW = new Date(2026, 10, 19, 12, 0);
const THREADS = 30_000;
const VIEWPORT = 880;
const MAX_ROWS = 100;
const INITIAL_RENDER_BUDGET_MS = 4_000;
const KEY_PRESSES = 220;
const KEYBOARD_BUDGET_MS = KEY_PRESSES * 100;
const KEYBOARD_TEST_TIMEOUT_MS = 60_000;

const renderBulk = (count = THREADS) => {
  const state = bulkDemoState(count, NOW);
  renderApp({ demo: () => createDemoMailClient({ aiStepMs: 0, state, now: () => NOW }) });
};

describe('virtualized thread list', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    resetStores();
    setListViewport(VIEWPORT);
  });
  afterEach(() => {
    resetStores();
    vi.useRealTimers();
  });

  it('renders a bounded number of rows for a folder with tens of thousands of threads', async () => {
    const started = performance.now();
    renderBulk();
    const listbox = await threadListbox();
    await waitForRows();
    const elapsed = performance.now() - started;

    expect(renderedRows()).toBeLessThan(MAX_ROWS);
    expect(elapsed).toBeLessThan(INITIAL_RENDER_BUDGET_MS);
    expect(optionPositions(listbox).slice(0, 3)).toEqual([1, 2, 3]);
    expect(within(listbox).getAllByRole('option')[0]?.getAttribute('aria-setsize')).toBe('-1');
  });

  it('keeps the rendered rows bounded while scrolling deep through loaded pages', async () => {
    renderBulk();
    const listbox = await threadListbox();
    await waitForRows();
    for (let page = 0; page < 5; page += 1) {
      const before = Number.parseFloat(listbox.style.height);
      scrollListToEnd(listbox);
      await waitFor(() => {
        expect(Number.parseFloat(listbox.style.height)).toBeGreaterThan(before);
      });
    }

    expect(Math.max(...optionPositions(listbox))).toBeGreaterThan(1_000);
    expect(renderedRows()).toBeLessThan(MAX_ROWS);
  });

  it(
    'scrolls the selected row into view when moving with the keyboard',
    async () => {
      renderBulk();
      const listbox = await threadListbox();
      await waitForRows();
      let elapsed = 0;
      for (let step = 0; step < KEY_PRESSES; step += 1) {
        const started = performance.now();
        press('j', {}, document.body);
        elapsed += performance.now() - started;
        if (step % 50 === 49) {
          await settle();
        }
      }

      await waitFor(() => {
        const selected = listbox.querySelector('.a-row.sel');
        expect(selected?.getAttribute('aria-posinset')).toBe(String(KEY_PRESSES + 1));
      });
      expect(scrollElementOf(listbox).scrollTop).toBeGreaterThan(KEY_PRESSES * 40 - VIEWPORT);
      expect(renderedRows()).toBeLessThan(MAX_ROWS);
      expect(elapsed).toBeLessThan(KEYBOARD_BUDGET_MS);
    },
    KEYBOARD_TEST_TIMEOUT_MS,
  );

  it('keeps the day header of the group at the top of the viewport rendered', async () => {
    renderBulk();
    const listbox = await threadListbox();
    await waitForRows();
    scrollListTo(listbox, 6_500);

    await waitFor(() => {
      expect(optionPositions(listbox)[0]).toBeGreaterThan(110);
    });
    const firstGroup = within(listbox).getAllByRole('group')[0];
    expect(firstGroup?.querySelector('.a-day')).not.toBeNull();
    expect(firstGroup?.querySelector('.a-day-label')?.textContent).toBe('Včera');
    expect(firstGroup?.getAttribute('aria-label')).toBe('Včera, streda 18. 11.');
  });

  it('restores the scroll position when coming back from an open thread', async () => {
    renderBulk();
    const listbox = await threadListbox();
    await waitForRows();
    scrollListTo(listbox, 4_400);
    await waitFor(() => {
      expect(optionPositions(listbox)[0]).toBeGreaterThan(80);
    });
    const row = within(listbox).getAllByRole('option')[10];
    const subject = row?.querySelector('.subj')?.textContent ?? '';
    act(() => {
      fireEvent.click(row ?? document.body);
    });
    await screen.findByRole('heading', { level: 1, name: subject });
    press('Escape', {}, document.body);

    const back = await threadListbox();
    await waitFor(() => {
      expect(scrollElementOf(back).scrollTop).toBe(4_400);
    });
    expect(
      within(back)
        .getAllByRole('option')
        .some((option) => option.textContent.includes(subject)),
    ).toBe(true);
  });
});
