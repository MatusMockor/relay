import type { TaskPriority } from '@relay/shared/domain';
import type { GitHubIssue } from './github-api-schemas';

const PRIORITY_BY_LEVEL: ReadonlyMap<string, TaskPriority> = new Map<string, TaskPriority>([
  ['urgent', 'urgent'],
  ['critical', 'urgent'],
  ['p0', 'urgent'],
  ['high', 'high'],
  ['p1', 'high'],
  ['medium', 'medium'],
  ['p2', 'medium'],
  ['low', 'low'],
  ['p3', 'low'],
  ['p4', 'low'],
]);

const PREFIXED_PRIORITY = /^priority\s*[:/-]\s*(\S+)$/;
const BARE_PRIORITY = /^p[0-4]$/;
const IN_PROGRESS = /^(?:status\s*[:/-]\s*)?(?:in[\s_-]?progress|doing)$/;

const normalized = (name: string): string => name.trim().toLowerCase();

export const labelNamesOf = (issue: GitHubIssue): string[] =>
  (issue.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : (label.name ?? '')))
    .filter((name) => name.trim() !== '');

const priorityOfLabel = (name: string): TaskPriority | null => {
  const label = normalized(name);
  const level = PREFIXED_PRIORITY.exec(label)?.[1] ?? (BARE_PRIORITY.test(label) ? label : null);
  return level === null ? null : (PRIORITY_BY_LEVEL.get(level) ?? null);
};

export const githubPriorityOf = (labels: readonly string[]): TaskPriority => {
  for (const label of labels) {
    const priority = priorityOfLabel(label);
    if (priority !== null) {
      return priority;
    }
  }
  return 'none';
};

export const inProgressLabelOf = (labels: readonly string[]): string | null =>
  labels.find((label) => IN_PROGRESS.test(normalized(label)))?.trim() ?? null;
