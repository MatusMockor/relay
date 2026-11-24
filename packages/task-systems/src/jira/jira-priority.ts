import type { TaskPriority } from '@relay/shared/domain';

const BY_NAME: ReadonlyMap<string, TaskPriority> = new Map<string, TaskPriority>([
  ['highest', 'urgent'],
  ['blocker', 'urgent'],
  ['critical', 'urgent'],
  ['high', 'high'],
  ['major', 'high'],
  ['medium', 'medium'],
  ['low', 'low'],
  ['lowest', 'low'],
  ['minor', 'low'],
  ['trivial', 'low'],
]);

export const jiraPriorityOf = (name: string | null | undefined): TaskPriority =>
  BY_NAME.get((name ?? '').trim().toLowerCase()) ?? 'none';
