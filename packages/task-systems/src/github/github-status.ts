import type { ExternalTaskStatus } from '@relay/shared/domain';
import { inProgressLabelOf } from './github-labels';

export const githubStatusOf = (
  state: string | null | undefined,
  labels: readonly string[],
): ExternalTaskStatus => {
  if ((state ?? '').toLowerCase() === 'closed') {
    return { name: 'Closed', category: 'done' };
  }
  const inProgress = inProgressLabelOf(labels);
  if (inProgress !== null) {
    return { name: inProgress.slice(0, 255), category: 'inProgress' };
  }
  return { name: 'Open', category: 'todo' };
};
