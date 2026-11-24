import { TASK_PRIORITIES, type ThreadSummary } from '@relay/shared';
import { PriorityIcon } from '@relay/ui';
import { PRIORITY_DIGIT, priorityTitle } from '../tasks/priority-labels';
import type { SetThreadPriority } from '../tasks/use-set-task-priority';
import type { Command } from './use-commands';

export const priorityCommands = (
  thread: ThreadSummary,
  ctx: string | undefined,
  setPriority: SetThreadPriority,
): Command[] =>
  TASK_PRIORITIES.map((priority) => ({
    id: `priority-${priority}`,
    label: priorityTitle(priority),
    sub: ctx,
    keys: ['P', PRIORITY_DIGIT[priority]],
    icon: <PriorityIcon priority={priority} />,
    alias: `priorita priority uloha task ${priority}`,
    run: () => {
      setPriority(thread, priority);
    },
  }));
