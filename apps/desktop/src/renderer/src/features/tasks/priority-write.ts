import type { Task, TaskId, TaskPriority } from '@relay/shared';
import { describeError } from '../../data/errors';
import {
  beginPriorityWrite,
  finishPriorityWrite,
  isLatestPriorityWrite,
  resetPendingPriorities,
} from './pending-priorities';

export const UNSUPPORTED_PRIORITY =
  'Server je starší a nepodporuje priority úloh. Aktualizuj server.';

export interface PriorityGateway {
  readonly update: (taskId: TaskId, priority: TaskPriority) => Promise<Task>;
  readonly confirm: (taskId: TaskId, priority: TaskPriority) => void;
  readonly refresh: () => void;
}

export type PriorityWriteResult =
  | { readonly kind: 'saved'; readonly previous: TaskPriority }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'failed'; readonly message: string };

type Outcome = { readonly kind: 'saved' } | { readonly kind: 'failed'; readonly message: string };

const SUPERSEDED: PriorityWriteResult = { kind: 'superseded' };

const queues = new Map<string, Promise<PriorityWriteResult>>();
const confirmed = new Map<string, TaskPriority>();

const attempt = (
  gateway: PriorityGateway,
  taskId: TaskId,
  priority: TaskPriority,
): Promise<Outcome> =>
  gateway.update(taskId, priority).then(
    (task): Outcome =>
      task.priority === priority
        ? { kind: 'saved' }
        : { kind: 'failed', message: UNSUPPORTED_PRIORITY },
    (error: unknown): Outcome => ({ kind: 'failed', message: describeError(error) }),
  );

const send = async (
  gateway: PriorityGateway,
  taskId: TaskId,
  priority: TaskPriority,
  write: number,
): Promise<PriorityWriteResult> => {
  if (!isLatestPriorityWrite(taskId, write)) {
    return SUPERSEDED;
  }
  const previous = confirmed.get(taskId) ?? priority;
  const outcome = await attempt(gateway, taskId, priority);
  if (outcome.kind === 'saved') {
    confirmed.set(taskId, priority);
    gateway.confirm(taskId, priority);
  }
  if (!isLatestPriorityWrite(taskId, write)) {
    return SUPERSEDED;
  }
  finishPriorityWrite(taskId, write);
  return outcome.kind === 'saved' ? { kind: 'saved', previous } : outcome;
};

const drain = (gateway: PriorityGateway, taskId: TaskId, queued: Promise<unknown>): void => {
  if (queues.get(taskId) !== queued) {
    return;
  }
  queues.delete(taskId);
  confirmed.delete(taskId);
  gateway.refresh();
};

export const writePriority = (
  gateway: PriorityGateway,
  taskId: TaskId,
  priority: TaskPriority,
  stored: TaskPriority,
): Promise<PriorityWriteResult> => {
  const write = beginPriorityWrite(taskId, priority);
  if (!confirmed.has(taskId)) {
    confirmed.set(taskId, stored);
  }
  const queued = (queues.get(taskId) ?? Promise.resolve(SUPERSEDED)).then(() =>
    send(gateway, taskId, priority, write),
  );
  queues.set(taskId, queued);
  void queued.then(() => {
    drain(gateway, taskId, queued);
  });
  return queued;
};

export const resetPriorityWrites = (): void => {
  queues.clear();
  confirmed.clear();
  resetPendingPriorities();
};
