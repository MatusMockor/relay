import type { ExternalTaskList } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { taskSystemKeys } from '../../data/hooks/task-system-keys';
import { useUiStore } from '../../state/ui-store';
import { PRIORITY_CHORD_KEY } from '../tasks/priority-keys';
import { orderedOpenTasks } from './open-tasks';
import { moveTaskSelection, selectedTask } from './task-selection';
import { useOpenTask } from './use-open-task';

const MOVES: Readonly<Record<string, number>> = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 };
const OPEN_KEYS: ReadonlySet<string> = new Set(['Enter', 'o']);
const MAIL_ONLY_KEYS: ReadonlySet<string> = new Set([
  'e',
  'h',
  'v',
  'l',
  'r',
  'f',
  '#',
  '!',
  'delete',
  '1',
  '2',
  '3',
  PRIORITY_CHORD_KEY,
]);

export type TaskSystemKeys = (event: KeyboardEvent, claim: (run: () => void) => void) => boolean;

export const useTaskSystemKeys = (): TaskSystemKeys => {
  const queryClient = useQueryClient();
  const openTask = useOpenTask();
  return (event, claim) => {
    const { folder } = useUiStore.getState();
    if (folder.kind !== 'taskSystem') {
      return false;
    }
    const list = queryClient.getQueryData<ExternalTaskList>(
      taskSystemKeys.tasks(folder.connectionId),
    );
    const tasks = orderedOpenTasks(list);
    const delta = MOVES[event.key];
    if (delta !== undefined) {
      claim(() => {
        moveTaskSelection(tasks, delta);
      });
      return true;
    }
    if (OPEN_KEYS.has(event.key)) {
      claim(() => {
        const task = selectedTask(tasks);
        if (task !== null) {
          openTask(task);
        }
      });
      return true;
    }
    return MAIL_ONLY_KEYS.has(event.key.toLowerCase());
  };
};
