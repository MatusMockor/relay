import type { ExternalTaskStatusCategory } from '@relay/shared/domain';

const BY_TYPE: ReadonlyMap<string, ExternalTaskStatusCategory> = new Map<
  string,
  ExternalTaskStatusCategory
>([
  ['triage', 'todo'],
  ['backlog', 'todo'],
  ['unstarted', 'todo'],
  ['started', 'inProgress'],
  ['completed', 'done'],
  ['canceled', 'done'],
]);

export const linearStatusCategoryOf = (
  type: string | null | undefined,
): ExternalTaskStatusCategory => BY_TYPE.get((type ?? '').trim().toLowerCase()) ?? 'todo';
