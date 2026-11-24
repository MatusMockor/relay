import type { RemoteTaskList } from '@relay/engine';
import type { JiraApiClient } from './jira-api-client';
import { SEARCH_DENIED_MESSAGE } from './jira-api-errors';
import { type JiraSearchPage, JiraSearchPageSchema } from './jira-api-schemas';
import { toRemoteTask } from './jira-issue-mapper';
import type { JiraEndpoint } from './jira-route';

export const MY_OPEN_ISSUES_JQL =
  'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC';

export const JIRA_ISSUE_FIELDS = ['summary', 'status', 'priority', 'project', 'duedate', 'updated'];

export interface JiraPaging {
  readonly pageSize: number;
  readonly maxIssues: number;
  readonly maxRequests: number;
}

export const DEFAULT_JIRA_PAGING: JiraPaging = { pageSize: 100, maxIssues: 300, maxRequests: 10 };

export const searchPage = (
  api: JiraApiClient,
  endpoint: JiraEndpoint,
  maxResults: number,
  pageToken: string | null,
): Promise<JiraSearchPage> =>
  api.send(
    {
      ...endpoint,
      method: 'POST',
      path: '/rest/api/3/search/jql',
      body: {
        jql: MY_OPEN_ISSUES_JQL,
        fields: JIRA_ISSUE_FIELDS,
        maxResults,
        ...(pageToken === null ? {} : { nextPageToken: pageToken }),
      },
      forbiddenMessage: SEARCH_DENIED_MESSAGE,
    },
    JiraSearchPageSchema,
  );

const nextTokenOf = (page: JiraSearchPage): string | null =>
  page.isLast === true ? null : (page.nextPageToken ?? null);

export const listMyOpenIssues = async (
  api: JiraApiClient,
  endpoint: JiraEndpoint,
  origin: string,
  paging: JiraPaging,
): Promise<RemoteTaskList> => {
  const tasks: RemoteTaskList['tasks'] = [];
  const seen = new Set<string>();
  let pageToken: string | null = null;
  for (let request = 0; request < paging.maxRequests; request += 1) {
    const wanted = Math.min(paging.pageSize, paging.maxIssues - tasks.length);
    const page: JiraSearchPage = await searchPage(api, endpoint, wanted, pageToken);
    tasks.push(...page.issues.map((issue) => toRemoteTask(origin, issue)));
    const next = nextTokenOf(page);
    if (tasks.length >= paging.maxIssues) {
      return {
        tasks: tasks.slice(0, paging.maxIssues),
        truncated: next !== null || tasks.length > paging.maxIssues,
      };
    }
    if (next === null) {
      return { tasks, truncated: false };
    }
    if (seen.has(next)) {
      return { tasks, truncated: true };
    }
    seen.add(next);
    pageToken = next;
  }
  return { tasks, truncated: true };
};
