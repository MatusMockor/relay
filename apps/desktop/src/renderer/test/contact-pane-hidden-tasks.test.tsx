// @vitest-environment jsdom
import type { ThreadId } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemoState } from '../src/data/demo/demo-state';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import {
  cloneThread,
  demoTask,
  seededClient,
  showContactOf,
  sidePane,
  threadIdOf,
} from './support/contact-pane';
import { renderApp, resetStores } from './support/render-app';

const NEWSLETTER = 'Č. 212: CSS anchor positioning v praxi';
const SENDER = 'Frontend týždenník';

const hideTasksInOther = (state: DemoState): void => {
  state.splits = state.splits.map((split) =>
    split.id === demoIds.split('other') ? { ...split, hideTasks: true } : split,
  );
};

const withTaskedClone = (state: DemoState): ThreadId => {
  hideTasksInOther(state);
  const tasked = cloneThread(state, NEWSLETTER, 'tasked', { state: 'inbox' });
  state.tasks = [...state.tasks, demoTask('tasked', tasked, 'open', 10)];
  return tasked;
};

const showNewsletter = async (client: MailClient, state: DemoState) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  showContactOf(threadIdOf(state, NEWSLETTER));
  await waitFor(() => {
    expect(within(sidePane()).getByRole('heading', { level: 3 }).textContent).toBe(SENDER);
  });
};

describe('sender-wide scans with a split that hides tasks', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('counts an inbox thread that the split hides because it is a task', async () => {
    const { state, client } = seededClient();
    withTaskedClone(state);
    cloneThread(state, NEWSLETTER, 'archived', { state: 'done' });
    await showNewsletter(client, state);

    await waitFor(() => {
      expect(within(sidePane()).getByText(/^3 maily · posledný /)).toBeDefined();
    });
  });

  it('archives an inbox thread that the split hides because it is a task', async () => {
    const { state, client } = seededClient();
    const tasked = withTaskedClone(state);
    await showNewsletter(client, state);

    act(() => {
      fireEvent.click(within(sidePane()).getByRole('button', { name: /Archivovať všetky/ }));
    });
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      `Archivovať 2 vlákna od ${SENDER}?`,
    );
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /^Archivovať/ }));
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Archivované: 2 vlákna');
    });
    expect(
      [threadIdOf(state, NEWSLETTER), tasked].map((id) => state.threads.get(id)?.summary.state),
    ).toEqual(['done', 'done']);
  });
});
