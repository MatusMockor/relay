// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import type { MailClient } from '../src/data/MailClient';
import { renderApp, resetStores } from './support/render-app';

const NOW = new Date(2026, 10, 19, 12, 0);

const DATES = [
  new Date(2026, 10, 19, 9, 5),
  new Date(2026, 10, 18, 16, 30),
  new Date(2026, 10, 17, 8, 15),
  new Date(2026, 10, 12, 11, 0),
  new Date(2026, 9, 3, 14, 0),
];

const datedClient = (): MailClient => {
  const state = buildDemoState(NOW);
  [...state.threads.values()].forEach((record, index) => {
    record.summary = {
      ...record.summary,
      lastMessageAt: (DATES[index % DATES.length] ?? NOW).toISOString(),
    };
  });
  return createDemoMailClient({ aiStepMs: 0, state });
};

const groupNamed = (name: string): HTMLElement => {
  const list = screen.getByRole('listbox', { name: 'Konverzácie' });
  return within(list).getByRole('group', { name });
};

const rowTimes = (group: HTMLElement): string[] => [
  ...new Set(Array.from(group.querySelectorAll('time')).map((time) => time.textContent)),
];

describe('thread list day headers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    resetStores();
  });
  afterEach(() => {
    resetStores();
    vi.useRealTimers();
  });

  it('hides the header for today, shows the label with its date for other days and only times in the rows', async () => {
    renderApp({ demo: datedClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBeGreaterThanOrEqual(DATES.length);
    });
    const today = groupNamed('Dnes, štvrtok 19. 11.');
    expect(today.querySelector('.a-day')).toBeNull();
    const yesterday = groupNamed('Včera, streda 18. 11.');
    expect(within(yesterday).getByText('Včera').className).toBe('a-day-label');
    expect(within(yesterday).getByText('streda 18. 11.').className).toBe('a-day-date');
    expect(rowTimes(today)).toEqual(['9:05']);
    expect(rowTimes(groupNamed('Včera, streda 18. 11.'))).toEqual(['16:30']);
    expect(rowTimes(groupNamed('Utorok, 17. 11.'))).toEqual(['8:15']);
  });

  it('keeps a date in the rows of the previous week and older months', async () => {
    renderApp({ demo: datedClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await waitFor(() => {
      expect(screen.getAllByRole('group').length).toBeGreaterThanOrEqual(DATES.length);
    });
    const previous = groupNamed('Minulý týždeň');
    expect(previous.querySelector('.a-day-date')).toBeNull();
    expect(rowTimes(previous)).toEqual(['12. 11.']);
    expect(rowTimes(groupNamed('Október'))).toEqual(['3. 10.']);
  });
});
