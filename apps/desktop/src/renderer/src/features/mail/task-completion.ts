import type { Task, TaskState, ThreadAction, ThreadId, ThreadSummary } from '@relay/shared';

export interface CompletionGateway {
  readonly openTasks: (threadId: ThreadId) => Promise<readonly Task[]>;
  readonly setTaskState: (task: Task, state: TaskState) => Promise<unknown>;
  readonly applyThread: (action: ThreadAction) => Promise<unknown>;
}

export interface ThreadChange {
  readonly closed: readonly Task[];
  readonly moved: boolean;
}

export interface ChangeResult {
  readonly change: ThreadChange;
  readonly failure: { readonly error: unknown } | null;
}

type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

const attempt = <T>(work: () => Promise<T>): Promise<Attempt<T>> =>
  work().then(
    (value): Attempt<T> => ({ ok: true, value }),
    (error: unknown): Attempt<T> => ({ ok: false, error }),
  );

interface TaskSettlement {
  readonly done: readonly Task[];
  readonly left: readonly Task[];
  readonly error: unknown;
}

const settleTasks = async (
  tasks: readonly Task[],
  run: (task: Task) => Promise<unknown>,
): Promise<TaskSettlement> => {
  const results = await Promise.allSettled(tasks.map(run));
  const failures: unknown[] = results.flatMap((result): unknown[] =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  return {
    done: tasks.filter((_task, index) => results[index]?.status === 'fulfilled'),
    left: tasks.filter((_task, index) => results[index]?.status === 'rejected'),
    error: failures[0],
  };
};

const NOTHING: ThreadChange = { closed: [], moved: false };

export const restoreAction = (thread: ThreadSummary): ThreadAction =>
  thread.state === 'reminder' && thread.remindAt !== null
    ? { type: 'remind', at: thread.remindAt }
    : { type: 'undone' };

const movesThread = (thread: ThreadSummary): boolean =>
  thread.state !== 'done' && thread.state !== 'trash';

export const revertChange = async (
  gateway: CompletionGateway,
  thread: ThreadSummary,
  change: ThreadChange,
): Promise<ChangeResult> => {
  const tasks = await settleTasks(change.closed, (task) => gateway.setTaskState(task, task.state));
  const failure = tasks.left.length === 0 ? null : { error: tasks.error };
  if (!change.moved) {
    return { change: { closed: tasks.left, moved: false }, failure };
  }
  const moved = await attempt(() => gateway.applyThread(restoreAction(thread)));
  if (!moved.ok) {
    return {
      change: { closed: tasks.left, moved: true },
      failure: failure ?? { error: moved.error },
    };
  }
  return { change: { closed: tasks.left, moved: false }, failure };
};

const compensate = async (
  gateway: CompletionGateway,
  thread: ThreadSummary,
  change: ThreadChange,
  error: unknown,
): Promise<ChangeResult> => {
  const reverted = await revertChange(gateway, thread, change);
  return { change: reverted.change, failure: { error } };
};

export const completeThread = async (
  gateway: CompletionGateway,
  thread: ThreadSummary,
): Promise<ChangeResult> => {
  const listed = await attempt(() => gateway.openTasks(thread.id));
  if (!listed.ok) {
    return { change: NOTHING, failure: { error: listed.error } };
  }
  const tasks = await settleTasks(listed.value, (task) => gateway.setTaskState(task, 'done'));
  const closed: ThreadChange = { closed: tasks.done, moved: false };
  if (tasks.left.length > 0) {
    return compensate(gateway, thread, closed, tasks.error);
  }
  if (!movesThread(thread)) {
    return { change: closed, failure: null };
  }
  const moved = await attempt(() => gateway.applyThread({ type: 'done' }));
  if (!moved.ok) {
    return compensate(gateway, thread, closed, moved.error);
  }
  return { change: { closed: tasks.done, moved: true }, failure: null };
};
