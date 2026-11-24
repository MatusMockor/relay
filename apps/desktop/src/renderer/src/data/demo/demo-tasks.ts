import { type AiOutput, compareTaskPriority, type Task } from '@relay/shared';
import { MailClientError } from '../errors';
import type { MailClient, TaskListParams } from '../MailClient';
import type { DemoState } from './demo-state';
import { demoIds } from './seed/ids';

export const demoTaskFromAi = (output: AiOutput, stamp: string, sequence: number): Task | null => {
  if (output.kind !== 'createTask') {
    return null;
  }
  return {
    id: demoIds.task(`ai-${String(sequence)}`),
    userId: demoIds.user,
    threadId: output.threadId,
    jiraKey: null,
    title: output.title,
    aiWhat: output.aiWhat,
    state: 'open',
    source: 'ai',
    priority: output.priority,
    createdAt: stamp,
    updatedAt: stamp,
  };
};

const matches = (task: Task, params: TaskListParams): boolean =>
  (params.state === undefined || task.state === params.state) &&
  (params.threadId === undefined || task.threadId === params.threadId);

export const createDemoTaskMethods = (
  state: DemoState,
  now: () => Date,
): Pick<MailClient, 'listTasks' | 'updateTask'> => ({
  listTasks: (params) =>
    Promise.resolve({
      items: state.tasks
        .filter((task) => matches(task, params))
        .sort((left, right) => compareTaskPriority(left.priority, right.priority)),
      nextCursor: null,
    }),
  updateTask: (taskId, patch) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task === undefined) {
      return Promise.reject(
        new MailClientError({ code: 'not_found', message: 'Úloha neexistuje' }),
      );
    }
    const next = { ...task, ...patch, updatedAt: now().toISOString() };
    state.tasks = state.tasks.map((item) => (item.id === taskId ? next : item));
    return Promise.resolve(next);
  },
});
