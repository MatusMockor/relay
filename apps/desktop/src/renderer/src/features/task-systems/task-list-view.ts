import type { ExternalTask, ExternalTaskList, TaskSystemConnection } from '@relay/shared';
import { describeError, MailClientError } from '../../data/errors';
import { orderedOpenTasks } from './open-tasks';

export interface TaskQueryState {
  readonly data: ExternalTaskList | undefined;
  readonly error: Error | null;
  readonly pending: boolean;
}

export type TaskListView =
  | { readonly kind: 'reconnect'; readonly message: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | {
      readonly kind: 'tasks';
      readonly list: ExternalTaskList;
      readonly tasks: readonly ExternalTask[];
    };

const isRejected = (error: Error | null): boolean =>
  error instanceof MailClientError && error.code === 'forbidden';

export const taskListViewOf = (
  connection: TaskSystemConnection | undefined,
  query: TaskQueryState,
): TaskListView => {
  const broken = connection?.status === 'error' && query.data === undefined;
  if (isRejected(query.error) || broken) {
    return { kind: 'reconnect', message: connection?.lastError ?? describeError(query.error) };
  }
  if (query.error !== null) {
    return { kind: 'failure', message: describeError(query.error) };
  }
  if (query.pending || query.data === undefined) {
    return { kind: 'loading' };
  }
  return { kind: 'tasks', list: query.data, tasks: orderedOpenTasks(query.data) };
};

export const visibleTasksOf = (view: TaskListView): readonly ExternalTask[] =>
  view.kind === 'tasks' ? view.tasks : [];
