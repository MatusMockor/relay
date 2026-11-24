import type { Task, TaskId, TaskPriority } from '@relay/shared';
import { describeError } from '../../data/errors';
import {
  beginPriorityWrite,
  finishPriorityWrite,
  isLatestPriorityWrite,
} from './pending-priorities';

export const UNSUPPORTED_PRIORITY =
  'Server je starší a nepodporuje priority úloh. Aktualizuj server.';

export interface PriorityGateway {
  readonly update: (taskId: TaskId, priority: TaskPriority) => Promise<Task>;
  readonly confirm: (taskId: TaskId, priority: TaskPriority) => void;
  readonly refresh: () => void;
}

export type PriorityWriteResult =
  | { readonly kind: 'saved' }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'failed'; readonly message: string };

const SAVED: PriorityWriteResult = { kind: 'saved' };

const attempt = (
  gateway: PriorityGateway,
  taskId: TaskId,
  priority: TaskPriority,
): Promise<PriorityWriteResult> =>
  gateway.update(taskId, priority).then(
    (task): PriorityWriteResult =>
      task.priority === priority ? SAVED : { kind: 'failed', message: UNSUPPORTED_PRIORITY },
    (error: unknown): PriorityWriteResult => ({ kind: 'failed', message: describeError(error) }),
  );

export const writePriority = async (
  gateway: PriorityGateway,
  taskId: TaskId,
  priority: TaskPriority,
): Promise<PriorityWriteResult> => {
  const write = beginPriorityWrite(taskId, priority);
  const result = await attempt(gateway, taskId, priority);
  if (!isLatestPriorityWrite(taskId, write)) {
    return { kind: 'superseded' };
  }
  if (result.kind === 'saved') {
    gateway.confirm(taskId, priority);
  }
  finishPriorityWrite(taskId, write);
  gateway.refresh();
  return result;
};
