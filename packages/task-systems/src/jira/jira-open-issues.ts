import type { RemoteTaskList } from '@relay/engine';
import type { JiraCredentials } from '@relay/shared/domain';
import type { JiraApiClient } from './jira-api-client';
import { type JiraSearchPage, JiraSearchPageSchema } from './jira-api-schemas';
import { toRemoteTask } from './jira-issue-mapper';

export const MY_OPEN_ISSUES_JQL =
  'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC';

export const JIRA_ISSUE_FIELDS = ['summary', 'status', 'priority', 'project', 'duedate', 'updated'];

export interface JiraPaging {
  readonly pageSize: number;
  readonly maxIssues: number;
}

export const DEFAULT_JIRA_PAGING: JiraPaging = { pageSize: 100, maxIssues: 300 };

export const listMyOpenIssues = async (
  api: JiraApiClient,
  origin: string,
  credentials: JiraCredentials,
  paging: JiraPaging,
): Promise<RemoteTaskList> => {
  const tasks: RemoteTaskList['tasks'] = [];
  let pageToken: string | null = null;
  while (tasks.length < paging.maxIssues) {
    const page: JiraSearchPage = await api.send(
      {
        origin,
        credentials,
        method: 'POST',
        path: '/rest/api/3/search/jql',
        body: {
          jql: MY_OPEN_ISSUES_JQL,
          fields: JIRA_ISSUE_FIELDS,
          maxResults: Math.min(paging.pageSize, paging.maxIssues - tasks.length),
          ...(pageToken === null ? {} : { nextPageToken: pageToken }),
        },
      },
      JiraSearchPageSchema,
    );
    tasks.push(...page.issues.map((issue) => toRemoteTask(origin, issue)));
    const next: string | null = page.isLast === true ? null : (page.nextPageToken ?? null);
    if (next === null || page.issues.length === 0) {
      return { tasks: tasks.slice(0, paging.maxIssues), truncated: false };
    }
    pageToken = next;
  }
  return { tasks: tasks.slice(0, paging.maxIssues), truncated: true };
};
