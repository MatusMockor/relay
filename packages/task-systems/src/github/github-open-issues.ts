import type { RemoteTaskList } from '@relay/engine';
import type { GitHubCredentials } from '@relay/shared/domain';
import type { TaskPaging } from '../shared/task-paging';
import type { GitHubApiClient, GitHubPage } from './github-api-client';
import { type GitHubIssue, GitHubIssueListSchema } from './github-api-schemas';
import { isPullRequest, toRemoteTask } from './github-issue-mapper';

export interface GitHubPaging extends TaskPaging {
  readonly maxPages: number;
}

export const DEFAULT_GITHUB_PAGING: GitHubPaging = { pageSize: 100, maxIssues: 300, maxPages: 10 };

export const assignedIssuesPath = (pageSize: number): string => {
  const query = new URLSearchParams({
    filter: 'assigned',
    state: 'open',
    per_page: String(pageSize),
    sort: 'updated',
  });
  return `/issues?${query.toString()}`;
};

export const listMyOpenGitHubIssues = async (
  api: GitHubApiClient,
  credentials: GitHubCredentials,
  paging: GitHubPaging,
): Promise<RemoteTaskList> => {
  const tasks: RemoteTaskList['tasks'] = [];
  let path: string | null = assignedIssuesPath(paging.pageSize);
  for (let pages = 0; path !== null && pages < paging.maxPages; pages += 1) {
    const page: GitHubPage<GitHubIssue[]> = await api.get(credentials, path, GitHubIssueListSchema);
    const issues = page.data.filter((issue) => !isPullRequest(issue));
    tasks.push(...issues.map(toRemoteTask));
    if (tasks.length >= paging.maxIssues) {
      const truncated = tasks.length > paging.maxIssues || page.next !== null;
      return { tasks: tasks.slice(0, paging.maxIssues), truncated };
    }
    path = page.next;
  }
  return { tasks, truncated: path !== null };
};
