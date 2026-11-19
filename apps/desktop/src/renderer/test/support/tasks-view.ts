import {
  type Task,
  type TaskId,
  TaskIdSchema,
  type ThreadAction,
  type ThreadId,
  type ThreadSummary,
} from '@relay/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import { buildDemoState } from '../../src/data/demo/seed/build-state';
import type { MailClient } from '../../src/data/MailClient';
import { press } from '../features-support';

export const TASK_TITLE = 'Export CSV: zlé kódovanie diakritiky';

export interface Recorded {
  readonly client: MailClient;
  readonly actions: ThreadAction['type'][];
}

export const recording = (base: MailClient): Recorded => {
  const actions: ThreadAction['type'][] = [];
  const client: MailClient = {
    ...base,
    applyThreadAction: (threadId, action) => {
      actions.push(action.type);
      return base.applyThreadAction(threadId, action);
    },
  };
  return { client, actions };
};

export const listingAllTaskThreads = (base: MailClient): MailClient => ({
  ...base,
  listThreads: async (params) => {
    const page = await base.listThreads(params);
    if (params.view !== 'tasks') {
      return page;
    }
    const tasks = await base.listTasks({});
    const others = await Promise.all([
      base.listThreads({ view: 'done' }),
      base.listThreads({ view: 'reminders' }),
    ]);
    const open = (thread: ThreadSummary) =>
      tasks.items.some((task) => task.threadId === thread.id && task.state !== 'done');
    const extra = others.flatMap((other) => other.items).filter(open);
    return { ...page, items: [...page.items, ...extra] };
  },
});

export const taskOf = async (client: MailClient, title = TASK_TITLE): Promise<Task> => {
  const tasks = await client.listTasks({});
  const task = tasks.items.find((item) => item.title === title);
  expect(task).toBeDefined();
  expect(task?.threadId).not.toBeNull();
  return task as Task;
};

export const threadIdOf = (task: Task): ThreadId => task.threadId as ThreadId;

export const threadOf = async (client: MailClient, threadId: ThreadId): Promise<ThreadSummary> =>
  (await client.getThread(threadId)).thread;

export const taskState = async (client: MailClient, taskId: TaskId) =>
  (await client.listTasks({})).items.find((task) => task.id === taskId)?.state;

const listbox = () => screen.getByRole('listbox', { name: 'Konverzácie' });

export const rowOf = (subject: string): HTMLElement | undefined =>
  within(listbox())
    .queryAllByRole('option')
    .find((row) => row.textContent.includes(subject));

export const selectedSubject = (): string =>
  within(listbox())
    .queryAllByRole('option')
    .find((row) => row.getAttribute('aria-selected') === 'true')
    ?.querySelector('.subj')
    ?.textContent.trim() ?? '';

export const gotoTasks = async (): Promise<void> => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  press('g', {}, document.body);
  press('u', {}, document.body);
};

export const openTasksView = async (subject: string): Promise<HTMLElement> => {
  await gotoTasks();
  await waitFor(() => {
    expect(rowOf(subject)).toBeDefined();
  });
  return rowOf(subject) ?? document.body;
};

export const toastText = (): string => screen.getByRole('status', { hidden: false }).textContent;

export const withSecondTask = (): { readonly client: MailClient; readonly second: Task } => {
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
