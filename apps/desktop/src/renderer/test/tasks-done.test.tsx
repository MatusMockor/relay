// @vitest-environment jsdom
import type { Task, ThreadSummary } from '@relay/shared';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';
import {
  gotoTasks,
  listingAllTaskThreads,
  openTasksView,
  recording,
  rowOf,
  selectedSubject,
  taskOf,
  taskState,
  threadIdOf,
  threadOf,
} from './support/tasks-view';

const DAY = 86_400_000;

const clickDone = (row: HTMLElement) => {
  act(() => {
    fireEvent.click(within(row).getByRole('button', { name: 'Hotovo' }));
  });
};

const beyondFirstPage = (base: MailClient, hidden: Task): MailClient => ({
  ...base,
  listTasks: async (params) => {
    const page = await base.listTasks(params);
    if (params.threadId !== undefined) {
      return page;
    }
    return { items: page.items.filter((task) => task.id !== hidden.id), nextCursor: 'next' };
  },
});

describe('done check in the tasks view', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('closes the task, moves the thread to done and undoes both', async () => {
    const base = demoClient();
    const { client, actions } = recording(base);
    renderApp({ demo: () => client });
    await gotoTasks();
    const listed = (await base.listThreads({ view: 'tasks' })).items;
    await waitFor(() => {
      expect(listed.some((thread) => selectedSubject().endsWith(thread.subject))).toBe(true);
    });
    const thread = listed.find((item) => selectedSubject().endsWith(item.subject)) as ThreadSummary;
    const task = (await base.listTasks({})).items.find((item) => item.threadId === thread.id);
    expect(task).toBeDefined();
    const before = task?.state;
    const taskId = task?.id as Task['id'];
    press('e', {}, document.body);
    await waitFor(() => {
      expect(rowOf(thread.subject)).toBeUndefined();
    });
    await waitFor(async () => {
      expect(await taskState(base, taskId)).toBe('done');
      expect((await threadOf(base, thread.id)).state).toBe('done');
    });
    expect(actions).toEqual(['done']);
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(await taskState(base, taskId)).toBe(before);
      expect((await threadOf(base, thread.id)).state).toBe('inbox');
    });
    await waitFor(() => {
      expect(rowOf(thread.subject)).toBeDefined();
    });
    expect(actions).toEqual(['done', 'undone']);
  });

  it('never pulls an already done thread back to the inbox', async () => {
    const base = demoClient();
    const task = await taskOf(base);
    await base.applyThreadAction(threadIdOf(task), { type: 'done' });
    const { client, actions } = recording(listingAllTaskThreads(base));
    const thread = await threadOf(base, threadIdOf(task));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(() => {
      expect(rowOf(thread.subject)).toBeUndefined();
    });
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe('done');
    });
    expect((await threadOf(base, thread.id)).state).toBe('done');
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe(task.state);
    });
    expect((await threadOf(base, thread.id)).state).toBe('done');
    expect(actions).toEqual([]);
  });

  it('brings a reminded thread back to its reminder on undo', async () => {
    const base = demoClient();
    const task = await taskOf(base);
    const remindAt = new Date(Date.now() + 2 * DAY).toISOString();
    await base.applyThreadAction(threadIdOf(task), { type: 'remind', at: remindAt });
    const { client, actions } = recording(listingAllTaskThreads(base));
    const thread = await threadOf(base, threadIdOf(task));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe('done');
      expect((await threadOf(base, thread.id)).state).toBe('done');
    });
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe(task.state);
      expect(await threadOf(base, thread.id)).toMatchObject({ state: 'reminder', remindAt });
    });
    expect(actions).toEqual(['done', 'remind']);
  });

  it('returns a thread whose reminder already passed to the inbox on undo', async () => {
    const base = demoClient();
    const task = await taskOf(base);
    const remindAt = new Date(Date.now() - 2 * DAY).toISOString();
    await base.applyThreadAction(threadIdOf(task), { type: 'remind', at: remindAt });
    const { client, actions } = recording(listingAllTaskThreads(base));
    const thread = await threadOf(base, threadIdOf(task));
    expect(thread.state).toBe('reminder');
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect((await threadOf(base, thread.id)).state).toBe('done');
    });
    press('z', {}, document.body);
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe(task.state);
      expect((await threadOf(base, thread.id)).state).toBe('inbox');
    });
    expect(actions).toEqual(['done', 'undone']);
  });

  it('closes a task that is not in the cached first page of tasks', async () => {
    const base = demoClient();
    const task = await taskOf(base);
    const { client, actions } = recording(beyondFirstPage(base, task));
    const thread = await threadOf(base, threadIdOf(task));
    renderApp({ demo: () => client });
    clickDone(await openTasksView(thread.subject));
    await waitFor(async () => {
      expect(await taskState(base, task.id)).toBe('done');
      expect((await threadOf(base, thread.id)).state).toBe('done');
    });
    expect(actions).toEqual(['done']);
  });
});
