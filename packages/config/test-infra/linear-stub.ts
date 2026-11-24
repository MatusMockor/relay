import type { ServerResponse } from 'node:http';
import { parseJsonOrNull, sendJson, startStubServer, type StubFailure } from './stub-http';

export interface LinearStubUser {
  readonly apiKey: string;
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface LinearStubOrganization {
  name: string;
  urlKey: string;
}

export interface LinearStubRequest {
  readonly authorization: string | null;
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
}

export interface LinearStub {
  readonly url: string;
  readonly apiUrl: string;
  readonly users: LinearStubUser[];
  readonly organization: LinearStubOrganization;
  readonly requests: LinearStubRequest[];
  pageSize: number;
  failNext(failure: StubFailure): void;
  issue(assigneeId: string, raw: Record<string, unknown>): void;
  close(): Promise<void>;
}

const AUTH_ERROR = {
  errors: [
    {
      message: 'Authentication required, not authenticated',
      extensions: { type: 'authentication error', code: 'AUTHENTICATION_ERROR' },
    },
  ],
};

const requestOf = (raw: string, authorization: string | undefined): LinearStubRequest => {
  const body = parseJsonOrNull(raw) as { query?: unknown; variables?: unknown } | null;
  const variables = body?.variables;
  return {
    authorization: authorization ?? null,
    query: typeof body?.query === 'string' ? body.query : '',
    variables: typeof variables === 'object' && variables !== null ? { ...variables } : {},
  };
};

export const startLinearStub = async (): Promise<LinearStub> => {
  const users: LinearStubUser[] = [];
  const issues: { readonly assigneeId: string; readonly raw: Record<string, unknown> }[] = [];
  const requests: LinearStubRequest[] = [];
  const failures: StubFailure[] = [];
  const organization: LinearStubOrganization = { name: 'Acme', urlKey: 'acme' };
  const state = { pageSize: 100 };

  const assignedIssues = (user: LinearStubUser, request: LinearStubRequest) => {
    const mine = issues.filter((issue) => issue.assigneeId === user.id);
    const first = typeof request.variables.first === 'number' ? request.variables.first : 50;
    const after = request.variables.after;
    const start = typeof after === 'string' ? Number(after.replace('cursor-', '')) : 0;
    const page = mine.slice(start, start + Math.min(first, state.pageSize));
    const end = start + page.length;
    return {
      nodes: page.map((issue) => issue.raw),
      pageInfo: {
        hasNextPage: end < mine.length,
        endCursor: page.length === 0 ? null : `cursor-${String(end)}`,
      },
    };
  };

  const answer = (user: LinearStubUser, request: LinearStubRequest, response: ServerResponse) => {
    if (request.query.includes('assignedIssues')) {
      sendJson(response, 200, {
        data: { viewer: { assignedIssues: assignedIssues(user, request) } },
      });
      return;
    }
    if (request.query.includes('organization')) {
      const viewer = { id: user.id, name: user.name, email: user.email };
      sendJson(response, 200, { data: { viewer, organization } });
      return;
    }
    sendJson(response, 400, { errors: [{ message: 'Unknown query' }] });
  };

  const server = await startStubServer((incoming, raw, response) => {
    const request = requestOf(raw, incoming.headers.authorization);
    requests.push(request);
    const failure = failures.shift();
    if (failure !== undefined) {
      sendJson(response, failure.status, failure.body ?? AUTH_ERROR, failure.headers);
      return;
    }
    const user = users.find((candidate) => candidate.apiKey === request.authorization);
    if (incoming.method !== 'POST' || incoming.url !== '/graphql') {
      sendJson(response, 404, { errors: [{ message: 'Not found' }] });
      return;
    }
    if (user === undefined) {
      sendJson(response, 400, AUTH_ERROR);
      return;
    }
    answer(user, request, response);
  });
  return {
    url: server.url,
    apiUrl: `${server.url}/graphql`,
    users,
    organization,
    requests,
    get pageSize() {
      return state.pageSize;
    },
    set pageSize(value: number) {
      state.pageSize = value;
    },
    failNext: (failure) => {
      failures.push(failure);
    },
    issue: (assigneeId, raw) => {
      issues.push({ assigneeId, raw });
    },
    close: server.close,
  };
};

export const linearStubIssue = (
  identifier: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: `issue-${identifier.toLowerCase()}`,
  identifier,
  title: `Úloha ${identifier}`,
  url: `https://linear.app/acme/issue/${identifier.toLowerCase()}`,
  priority: 3,
  state: { name: 'Todo', type: 'unstarted' },
  team: { name: 'Engineering' },
  project: null,
  dueDate: null,
  updatedAt: '2026-11-14T08:30:00.000Z',
  ...overrides,
});
