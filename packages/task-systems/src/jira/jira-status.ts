import type { ExternalTaskStatusCategory } from '@relay/shared/domain';

const BY_CATEGORY: Readonly<Record<string, ExternalTaskStatusCategory>> = {
  new: 'todo',
  indeterminate: 'inProgress',
  done: 'done',
};

export const jiraStatusCategoryOf = (key: string | null | undefined): ExternalTaskStatusCategory =>
  BY_CATEGORY[key ?? ''] ?? 'todo';
