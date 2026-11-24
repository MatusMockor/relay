import { useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../../state/ui-store';
import { PRIORITY_CHORD_KEY } from '../tasks/priority-keys';
import { visibleTasksOf } from './task-list-view';
import { moveTaskSelection, selectedTask } from './task-selection';
import { cachedTaskListView } from './use-task-list-view';
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
    const { folder, openThreadId } = useUiStore.getState();
    if (folder.kind !== 'taskSystem' || openThreadId !== null) {
      return false;
    }
    const tasks = visibleTasksOf(cachedTaskListView(queryClient, folder.connectionId));
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
