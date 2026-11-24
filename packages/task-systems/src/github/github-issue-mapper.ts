import type { RemoteExternalTask } from '@relay/engine';
import { clip } from '../shared/text';
import { isoTimestampOf } from '../shared/timestamp';
import type { GitHubIssue } from './github-api-schemas';
import { githubPriorityOf, labelNamesOf } from './github-labels';
import { githubStatusOf } from './github-status';

const REPOSITORY_URL = /\/repos\/([^/]+\/[^/]+)\/?$/;
const DUE_DATE = /^(\d{4}-\d{2}-\d{2})T/;

export const isPullRequest = (issue: GitHubIssue): boolean =>
  issue.pull_request !== undefined && issue.pull_request !== null;

const repositoryOf = (issue: GitHubIssue): string | null =>
  issue.repository?.full_name ?? REPOSITORY_URL.exec(issue.repository_url ?? '')?.[1] ?? null;

const dueDateOf = (issue: GitHubIssue): string | null =>
  DUE_DATE.exec(issue.milestone?.due_on ?? '')?.[1] ?? null;

export const toRemoteTask = (issue: GitHubIssue): RemoteExternalTask => {
  const repository = repositoryOf(issue);
  const labels = labelNamesOf(issue);
  return {
    externalId: String(issue.id),
    key: `${repository ?? ''}#${String(issue.number)}`.slice(-200),
    title: clip(issue.title, 1000),
    url: issue.html_url,
    status: githubStatusOf(issue.state, labels),
    priority: githubPriorityOf(labels),
    projectName: repository === null ? null : repository.slice(0, 255),
    dueDate: dueDateOf(issue),
    updatedAt: isoTimestampOf(issue.updated_at),
  };
};
