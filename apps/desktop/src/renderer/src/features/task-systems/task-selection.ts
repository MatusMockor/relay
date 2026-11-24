import type { ExternalTask } from '@relay/shared';
import { folderKey } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { selectKey } from '../mail/selection';
import { taskKeyOf } from './open-tasks';

export const selectedTaskKey = (
  tasks: readonly ExternalTask[],
  stored: string | undefined,
): string | null => {
  if (stored !== undefined && tasks.some((task) => taskKeyOf(task) === stored)) {
    return stored;
  }
  const first = tasks[0];
  return first === undefined ? null : taskKeyOf(first);
};

const storedKey = (): string | undefined => {
  const state = useUiStore.getState();
  return state.selected[folderKey(state.folder)];
};

export const selectedTask = (tasks: readonly ExternalTask[]): ExternalTask | null => {
  const key = selectedTaskKey(tasks, storedKey());
  return tasks.find((task) => taskKeyOf(task) === key) ?? null;
};

export const moveTaskSelection = (tasks: readonly ExternalTask[], delta: number): void => {
  const current = selectedTaskKey(tasks, storedKey());
  const index = Math.max(
    0,
    tasks.findIndex((task) => taskKeyOf(task) === current),
  );
  const next = tasks[Math.max(0, Math.min(tasks.length - 1, index + delta))];
  if (next === undefined) {
    return;
  }
  selectKey(taskKeyOf(next));
};
