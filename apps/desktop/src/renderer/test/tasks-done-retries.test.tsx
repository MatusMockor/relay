// @vitest-environment jsdom
import type { Task, ThreadSummary } from '@relay/shared';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailClientError } from '../src/data/errors';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, gate, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';
import {
  openTasksView,
  recording,
  rowOf,
  taskOf,
  taskState,
  threadIdOf,
  threadOf,
  toastText,
  withSecondTask,
} from './support/tasks-view';

const TASK_FAILED = 'Úlohu sa nepodarilo uložiť';
const RESTORE_FAILED = 'Úlohu sa nepodarilo obnoviť';

const clickDone = (row: HTMLElement | undefined) => {
  expect(row).toBeDefined();
  act(() => {
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Hotovo' }));
  });
};

const rejection = (message: string) =>
  Promise.reject(new MailClientError({ code: 'internal', message }));

const flakyRestores = (base: MailClient, failures: number, closing?: Task): MailClient => {
  let left = failures;
  return {
    ...base,
    updateTask: async (taskId, patch) => {
      if (patch.state === 'done' && taskId === closing?.id) {
        await base.updateTask(taskId, patch);
        return rejection(TASK_FAILED);
      }
      const restoring = patch.state !== 'done' && (closing === undefined || taskId === closing.id);
      if (restoring && left > 0) {
        left -= 1;
        return rejection(RESTORE_FAILED);
      }
      return base.updateTask(taskId, patch);
    },
  };
};

const heldTasks = (base: MailClient, held: Promise<void>, threadId: ThreadSummary['id']) => ({
  ...base,
  updateTask: async (taskId: Task['id'], patch: Parameters<MailClient['updateTask']>[1]) => {
    const tasks = (await base.listTasks({ threadId })).items;
    if (tasks.some((task) => task.id === taskId)) {
      await held;
    }
    return base.updateTask(taskId, patch);
  },
});

describe('done check in the tasks view when undo or completion overlap', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('reopens a task whose rejected close still reached the server', async () => {
    const { client: base, second } = withSecondTask();
    const first = await taskOf(base);
    const thread = await threadOf(base, threadIdOf(first));
    renderApp({ demo: () => flakyRestores(base, 1, second) });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(toastText()).toContain(TASK_FAILED);
      expect(await taskState(base, first.id)).toBe(first.state);
    });
    expect(await taskState(base, second.id)).toBe('done');
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(await taskState(base, second.id)).toBe('open');
    });
    expect((await threadOf(base, thread.id)).state).toBe('inbox');
    press('z', {}, document.body);
    expect(toastText()).toContain('Nie je čo vrátiť');
  });

  it('offers undo again when reopening the task fails', async () => {
    const base = demoClient();
    const task = await taskOf(base);
    const { client, actions } = recording(flakyRestores(base, 1));
    const thread = await threadOf(base, threadIdOf(task));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe('done');
      expect((await threadOf(base, thread.id)).state).toBe('done');
    });
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(toastText()).toContain(RESTORE_FAILED);
      expect((await threadOf(base, thread.id)).state).toBe('inbox');
    });
    expect(await taskState(base, task.id)).toBe('done');
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe(task.state);
    });
    expect(actions).toEqual(['done', 'undone']);
    await settle();
    press('z', {}, document.body);
    expect(toastText()).toContain('Nie je čo vrátiť');
  });

  it('keeps a pending thread hidden while another completion refreshes the list', async () => {
    const base = demoClient();
    const listed = (await base.listThreads({ view: 'tasks' })).items;
    const [slow, fast] = listed;
    expect(fast).toBeDefined();
    const held = gate();
    const slowThread = slow as ThreadSummary;
    const fastThread = fast as ThreadSummary;
    const { client, actions } = recording(heldTasks(base, held.wait(), slowThread.id));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(slowThread.subject));
    await waitFor(() => {
      expect(rowOf(slowThread.subject)).toBeUndefined();
    });
    clickDone(rowOf(fastThread.subject));
    await waitFor(async () => {
      expect((await threadOf(base, fastThread.id)).state).toBe('done');
      expect(actions).toEqual(['done']);
    });
    await settle(50);
    expect(rowOf(slowThread.subject)).toBeUndefined();
    held.open();
    await waitFor(async () => {
      expect((await threadOf(base, slowThread.id)).state).toBe('done');
    });
    await settle(50);
    expect(rowOf(slowThread.subject)).toBeUndefined();
  });
});
