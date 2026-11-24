import type { RemoteExternalTask } from '@relay/engine';
import type { JiraIssue } from './jira-api-schemas';
import { jiraPriorityOf } from './jira-priority';
import { jiraStatusCategoryOf } from './jira-status';
import { jiraTimestampOf } from './jira-timestamp';

const clip = (value: string | null | undefined, max: number): string =>
  (value ?? '').trim().slice(0, max);

const projectOf = (issue: JiraIssue): string | null => {
  const name = clip(issue.fields.project?.name ?? issue.fields.project?.key, 255);
  return name === '' ? null : name;
};

export const toRemoteTask = (origin: string, issue: JiraIssue): RemoteExternalTask => ({
  externalId: issue.id,
  key: issue.key,
  title: clip(issue.fields.summary, 1000),
  url: `${origin}/browse/${encodeURIComponent(issue.key)}`,
  status: {
    name: clip(issue.fields.status?.name, 255),
    category: jiraStatusCategoryOf(issue.fields.status?.statusCategory?.key),
  },
  priority: jiraPriorityOf(issue.fields.priority?.name),
  projectName: projectOf(issue),
  dueDate: issue.fields.duedate ?? null,
  updatedAt: jiraTimestampOf(issue.fields.updated),
});
