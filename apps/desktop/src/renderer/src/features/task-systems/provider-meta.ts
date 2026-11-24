import type { TaskSystemProvider } from '@relay/shared';

export const PROVIDER_NAME: Readonly<Record<TaskSystemProvider, string>> = {
  jira: 'Jira',
  linear: 'Linear',
  github: 'GitHub Issues',
};
