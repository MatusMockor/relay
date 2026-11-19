// @vitest-environment jsdom
import { type Task, TaskIdSchema } from '@relay/shared';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { MailClientError } from '../src/data/errors';
import type { MailClient } from '../src/data/MailClient';
import { gate, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';
import {
  openTasksView,
  recording,
  rowOf,
  TASK_TITLE,
  taskOf,
  taskState,
  threadIdOf,
  threadOf,
  toastText,
} from './support/tasks-view';

const ARCHIVE_FAILED = 'Archivácia zlyhala';
const TASK_FAILED = 'Úlohu sa nepodarilo uložiť';

const clickDone = (row: HTMLElement) => {
  act(() => {
    fireEvent.click(within(row).getByRole('button', { name: 'Hotovo' }));
  });
};

const heldArchive = (base: MailClient, held: Promise<void>, fail: boolean): MailClient => ({
  ...base,
  applyThreadAction: async (threadId, action) => {
    if (action.type !== 'done') {
      return base.applyThreadAction(threadId, action);
    }
    await held;
    if (fail) {
      return Promise.reject(new MailClientError({ code: 'internal', message: ARCHIVE_FAILED }));
    }
    return base.applyThreadAction(threadId, action);
  },
});

const withSecondTask = (): { readonly client: MailClient; readonly second: Task } => {
  const state = buildDemoState();
  const first = state.tasks.find((task) => task.title === TASK_TITLE);
  expect(first).toBeDefined();
  const second: Task = {
    ...(first as Task),
    id: TaskIdSchema.parse('task-second'),
    title: 'Druhá úloha k CSV exportu',
    state: 'open',
  };
  state.tasks = [...state.tasks, second];
  return { client: createDemoMailClient({ aiStepMs: 0, state }), second };
};

const failingTask = (base: MailClient, failing: Task, calls: string[]): MailClient => ({
  ...base,
  updateTask: (taskId, patch) => {
    calls.push(`${taskId}:${patch.state ?? ''}`);
    if (taskId === failing.id && patch.state === 'done') {
      return Promise.reject(new MailClientError({ code: 'internal', message: TASK_FAILED }));
    }
    return base.updateTask(taskId, patch);
  },
});

describe('done check in the tasks view when the server is slow or fails', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('waits for a slow archive before an early undo reverts it', async () => {
    const base = createDemoMailClient({ aiStepMs: 0 });
    const held = gate();
    const { client, actions } = recording(heldArchive(base, held.wait(), false));
    const task = await taskOf(base);
    const thread = await threadOf(base, threadIdOf(task));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe('done');
      expect(actions).toEqual(['done']);
    });
    press('z', {}, document.body);
    held.open();
    await waitFor(async () => {
      expect(actions).toEqual(['done', 'undone']);
      expect(await taskState(base, task.id)).toBe(task.state);
      expect((await threadOf(base, thread.id)).state).toBe('inbox');
    });
  });

  it('reopens the tasks when the archive fails and never sends undone', async () => {
    const base = createDemoMailClient({ aiStepMs: 0 });
    const held = gate();
    const { client, actions } = recording(heldArchive(base, held.wait(), true));
    const task = await taskOf(base);
    const thread = await threadOf(base, threadIdOf(task));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe('done');
    });
    press('z', {}, document.body);
    held.open();
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe(task.state);
      expect(toastText()).toContain(ARCHIVE_FAILED);
    });
    expect((await threadOf(base, thread.id)).state).toBe('inbox');
    expect(actions).toEqual(['done']);
    await waitFor(() => {
      expect(rowOf(thread.subject)).toBeDefined();
    });
  });

  it('restores exactly the tasks that changed when one task update fails', async () => {
    const { client: base, second } = withSecondTask();
    const first = await taskOf(base);
    const calls: string[] = [];
    const { client, actions } = recording(failingTask(base, second, calls));
    const thread = await threadOf(base, threadIdOf(first));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(toastText()).toContain(TASK_FAILED);
      expect(await taskState(base, first.id)).toBe(first.state);
    });
    expect(await taskState(base, second.id)).toBe('open');
    expect((await threadOf(base, thread.id)).state).toBe('inbox');
    expect(actions).toEqual([]);
    expect(calls.sort()).toEqual(
      [`${first.id}:done`, `${second.id}:done`, `${first.id}:${first.state}`].sort(),
    );
    await waitFor(() => {
      expect(rowOf(thread.subject)).toBeDefined();
    });
    press('z', {}, document.body);
    await waitFor(() => {
      expect(toastText()).toContain('Vrátené');
    });
    expect(calls).toHaveLength(3);
    expect(await taskState(base, first.id)).toBe(first.state);
    expect(actions).toEqual([]);
  });
});
