import type { TaskPriority } from '@relay/shared';

export const PRIORITY_GROUP_LABEL: Readonly<Record<TaskPriority, string>> = {
  urgent: 'Urgentné',
  high: 'Vysoká',
  medium: 'Stredná',
  low: 'Nízka',
  none: 'Bez priority',
};

export const PRIORITY_NAME: Readonly<Record<TaskPriority, string>> = {
  urgent: 'Urgentná',
  high: 'Vysoká',
  medium: 'Stredná',
  low: 'Nízka',
  none: 'Bez priority',
};

export const PRIORITY_DIGIT: Readonly<Record<TaskPriority, string>> = {
  urgent: '1',
  high: '2',
  medium: '3',
  low: '4',
  none: '0',
};

export const priorityTitle = (priority: TaskPriority): string =>
  `Priorita: ${PRIORITY_NAME[priority]}`;
