import type { RemoteTaskList } from '@relay/engine';
import type { LinearCredentials } from '@relay/shared/domain';
import type { TaskPaging } from '../shared/task-paging';
import type { LinearApiClient } from './linear-api-client';
import { type LinearIssuesPage, LinearIssuesPageSchema } from './linear-api-schemas';
import { toRemoteTask } from './linear-issue-mapper';
import { LINEAR_ASSIGNED_ISSUES_QUERY } from './linear-queries';

const pageOf = (
  api: LinearApiClient,
  credentials: LinearCredentials,
  first: number,
  after: string | null,
): Promise<LinearIssuesPage> =>
  api.send(
    { credentials, query: LINEAR_ASSIGNED_ISSUES_QUERY, variables: { first, after } },
    LinearIssuesPageSchema,
  );

export const listMyOpenLinearIssues = async (
  api: LinearApiClient,
  credentials: LinearCredentials,
  paging: TaskPaging,
): Promise<RemoteTaskList> => {
  const tasks: RemoteTaskList['tasks'] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let pages = 0; pages < paging.maxPages && tasks.length < paging.maxIssues; pages += 1) {
    const first = Math.min(paging.pageSize, paging.maxIssues - tasks.length);
    const page = await pageOf(api, credentials, first, cursor);
    const { nodes, pageInfo } = page.viewer.assignedIssues;
    tasks.push(...nodes.map(toRemoteTask));
    const next = pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null;
    if (next === null) {
      return { tasks: tasks.slice(0, paging.maxIssues), truncated: false };
    }
    if (seen.has(next)) {
      return { tasks: tasks.slice(0, paging.maxIssues), truncated: true };
    }
    seen.add(next);
    cursor = next;
  }
  return { tasks: tasks.slice(0, paging.maxIssues), truncated: true };
};
