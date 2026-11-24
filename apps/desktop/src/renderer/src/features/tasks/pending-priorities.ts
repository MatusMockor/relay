import type { TaskId, TaskPriority } from '@relay/shared';
import { create } from 'zustand';

export type PendingPriorities = Readonly<Record<string, TaskPriority>>;

interface PendingState {
  readonly pending: PendingPriorities;
}

export const usePendingPriorityStore = create<PendingState>(() => ({ pending: {} }));

const latest = new Map<string, number>();
let sequence = 0;

export const beginPriorityWrite = (taskId: TaskId, priority: TaskPriority): number => {
  sequence += 1;
  latest.set(taskId, sequence);
  usePendingPriorityStore.setState((state) => ({
    pending: { ...state.pending, [taskId]: priority },
  }));
  return sequence;
};

export const isLatestPriorityWrite = (taskId: TaskId, write: number): boolean =>
  latest.get(taskId) === write;

export const finishPriorityWrite = (taskId: TaskId, write: number): void => {
  if (!isLatestPriorityWrite(taskId, write)) {
    return;
  }
  latest.delete(taskId);
  usePendingPriorityStore.setState((state) => ({
    pending: Object.fromEntries(Object.entries(state.pending).filter(([id]) => id !== taskId)),
  }));
};

export const resetPendingPriorities = (): void => {
  latest.clear();
  usePendingPriorityStore.setState({ pending: {} });
};
