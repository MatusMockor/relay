// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { TOOLTIP_DELAY } from '@relay/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openFirstThread = async () => {
  renderApp({ demo: () => demoClient() });
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  const [first] = within(list).getAllByRole('option');
  expect(first).toBeDefined();
  act(() => {
    if (first !== undefined) {
      fireEvent.click(first);
    }
  });
};

describe('thread toolbar tooltips', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetStores();
  });

  it('explains the spam button with its shortcut on hover', async () => {
    await openFirstThread();
    const spam = await screen.findByRole('button', { name: 'Nahlásiť spam' });
    expect(spam.getAttribute('title')).toBeNull();

    vi.useFakeTimers();
    fireEvent.mouseEnter(spam);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY);
    });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toBe('Nahlásiť spam !');
    expect(within(tooltip).getByText('!').className).toContain('kbd');
    expect(spam.getAttribute('aria-describedby')).toBe(tooltip.id);

    fireEvent.mouseLeave(spam);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('describes the thread navigation buttons on keyboard focus', async () => {
    await openFirstThread();
    const next = await screen.findByRole('button', { name: 'Ďalšia' });
    expect(next.getAttribute('title')).toBeNull();

    act(() => {
      next.focus();
    });

    expect(screen.getByRole('tooltip').textContent).toBe('Ďalšia J');
    expect(next.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  });
});
