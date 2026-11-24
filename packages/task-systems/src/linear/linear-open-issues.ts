import type { RemoteTaskList } from '@relay/engine';
import type { LinearCredentials } from '@relay/shared/domain';
import type { TaskPaging } from '../shared/task-paging';
import type { LinearApiClient } from './linear-api-client';
import { type LinearIssuesPage, LinearIssuesPageSchema } from './linear-api-schemas';
import { toRemoteTask } from './linear-issue-mapper';
import { LINEAR_ASSIGNED_ISSUES_QUERY } from './linear-queries';

export const listMyOpenLinearIssues = async (
  api: LinearApiClient,
  credentials: LinearCredentials,
  paging: TaskPaging,
): Promise<RemoteTaskList> => {
  const tasks: RemoteTaskList['tasks'] = [];
  let cursor: string | null = null;
  while (tasks.length < paging.maxIssues) {
    const page: LinearIssuesPage = await api.send(
      {
        credentials,
        query: LINEAR_ASSIGNED_ISSUES_QUERY,
        variables: {
          first: Math.min(paging.pageSize, paging.maxIssues - tasks.length),
          after: cursor,
        },
      },
      LinearIssuesPageSchema,
    );
    const { nodes, pageInfo } = page.viewer.assignedIssues;
    tasks.push(...nodes.map(toRemoteTask));
    const next = pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null;
    if (next === null || nodes.length === 0) {
      return { tasks: tasks.slice(0, paging.maxIssues), truncated: false };
    }
    cursor = next;
  }
  return { tasks: tasks.slice(0, paging.maxIssues), truncated: true };
};
