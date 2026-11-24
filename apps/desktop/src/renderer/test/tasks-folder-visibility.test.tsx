// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import type { MailClient } from '../src/data/MailClient';
import { setUi, useUiStore } from '../src/state/ui-store';
import { press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const sidebar = () => screen.getByRole('navigation', { name: 'Priečinky' });

const withoutTasks = (): MailClient => {
  const state = buildDemoState();
  state.tasks = [];
  return createDemoMailClient({ aiStepMs: 0, state });
};

describe('tasks folder in the sidebar', () => {
  beforeEach(() => {
    resetStores();
    setUi({ leftUser: true });
  });
  afterEach(() => {
    resetStores();
  });

  it('stays visible and opens the empty tasks view when there are no tasks', async () => {
    renderApp({ demo: withoutTasks });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    const tasks = await within(sidebar()).findByRole('button', { name: /Moje úlohy/ });

    act(() => {
      fireEvent.click(tasks);
    });

    expect(await screen.findByText('Žiadne úlohy')).toBeDefined();
  });

  it('cycles from the main tab to the tasks tab when there are no tasks', async () => {
    renderApp({ demo: withoutTasks });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    press('Tab', {}, document.body);

    expect(useUiStore.getState().folder).toEqual({ kind: 'view', view: 'tasks' });
  });
});
