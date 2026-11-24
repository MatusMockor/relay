import type { ExternalTask, ExternalTaskList } from '@relay/shared';
import { groupByPriorityOf, type PriorityGroup } from '../tasks/priority-groups';

export const taskKeyOf = (task: ExternalTask): string => task.externalId;

const priorityOf = (task: ExternalTask) => task.priority;

export const openTasksOf = (list: ExternalTaskList | undefined): ExternalTask[] =>
  (list?.items ?? []).filter((task) => task.status.category !== 'done');

export const groupTasks = (tasks: readonly ExternalTask[]): PriorityGroup<ExternalTask>[] =>
  groupByPriorityOf(tasks, priorityOf);

export const orderedOpenTasks = (list: ExternalTaskList | undefined): ExternalTask[] =>
  groupTasks(openTasksOf(list)).flatMap((group) => group.items);
