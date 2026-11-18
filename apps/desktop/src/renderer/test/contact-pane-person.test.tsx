// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cloneThread,
  demoTask,
  sectionRows,
  seededClient,
  showContactOf,
  sidePane,
  threadIdOf,
} from './support/contact-pane';
import { renderApp, resetStores } from './support/render-app';

const STAGE = 'Prístupy na stage pre nového kolegu';
const ONBOARDING = 'Re: Onboarding checklist';

describe('contact pane for a person', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('shows the conversation count in the subtitle and the newest open tasks', async () => {
    const { state, client } = seededClient();
    const stage = threadIdOf(state, STAGE);
    const onboarding = threadIdOf(state, ONBOARDING);
    const unrelated = threadIdOf(state, 'Obed v piatok?');
    state.tasks = [
      ...state.tasks,
      demoTask('oldest', stage, 'open', 400),
      demoTask('older', stage, 'open', 300),
      demoTask('newer', onboarding, 'open', 200),
      demoTask('newest', stage, 'open', 100),
      demoTask('waiting', stage, 'waiting', 10),
      demoTask('done', onboarding, 'done', 10),
      demoTask('foreign', unrelated, 'open', 10),
    ];
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    showContactOf(stage);

    await waitFor(() => {
      expect(within(sidePane()).getByRole('heading', { level: 3 }).textContent).toBe('Lucia Hrubá');
    });
    await waitFor(() => {
      expect(within(sidePane()).getByText('lucia.hruba@firma.sk')).toBeDefined();
      expect(within(sidePane()).getByText('2 konverzácie')).toBeDefined();
    });
    expect(within(sidePane()).queryByRole('heading', { name: 'Kontakt' })).toBeNull();
    expect(within(sidePane()).getByRole('button', { name: /Napísať/ })).toBeDefined();
    expect(within(sidePane()).getByRole('button', { name: /Opýtať sa AI/ })).toBeDefined();
    await waitFor(() => {
      expect(sectionRows('Otvorené úlohy')).toEqual(['Úloha newest', 'Úloha newer', 'Úloha older']);
    });
    expect(sectionRows('Posledné konverzácie')).toEqual([ONBOARDING]);

    const task = within(sidePane()).getByRole('button', { name: /Úloha newer/ });
    act(() => {
      fireEvent.click(task);
    });
    await screen.findByRole('heading', { level: 1, name: ONBOARDING });
  });

  it('hides the open tasks section when the contact has none', async () => {
    const { state, client } = seededClient();
    const stage = threadIdOf(state, STAGE);
    state.tasks = [...state.tasks, demoTask('waiting', stage, 'waiting', 10)];
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    showContactOf(stage);

    await waitFor(() => {
      expect(within(sidePane()).getByRole('heading', { level: 3 }).textContent).toBe('Lucia Hrubá');
    });
    await waitFor(() => {
      expect(sectionRows('Posledné konverzácie')).toEqual([ONBOARDING]);
    });
    expect(within(sidePane()).queryByRole('heading', { name: 'Otvorené úlohy' })).toBeNull();
  });

  it('follows the thread list cursor to find older conversations with the contact', async () => {
    const { state, client } = seededClient();
    const now = Date.now();
    for (let index = 0; index < 210; index += 1) {
      cloneThread(state, 'Obed v piatok?', `filler-${String(index)}`, {
        lastMessageAt: new Date(now - index * 60_000).toISOString(),
      });
    }
    cloneThread(state, STAGE, 'old-lucia', {
      subject: 'Starý návrh pre Luciu',
      lastMessageAt: new Date(now - 40 * 86_400_000).toISOString(),
    });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    showContactOf(threadIdOf(state, STAGE));

    await waitFor(() => {
      expect(sectionRows('Posledné konverzácie')).toEqual([ONBOARDING, 'Starý návrh pre Luciu']);
    });
  });
});
