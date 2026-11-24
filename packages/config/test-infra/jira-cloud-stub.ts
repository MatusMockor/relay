import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface JiraStubUser {
  readonly email: string;
  readonly apiToken: string;
  readonly accountId: string;
  readonly displayName: string;
}

export interface JiraStubIssue {
  readonly assignee: string;
  readonly raw: Record<string, unknown>;
}

export interface JiraStubRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

export interface JiraStubFailure {
  readonly status: number;
  readonly body?: unknown;
}

export interface JiraCloudStub {
  readonly url: string;
  readonly users: JiraStubUser[];
  readonly issues: JiraStubIssue[];
  readonly requests: JiraStubRequest[];
  pageSize: number;
  failNext(failure: JiraStubFailure): void;
  issue(assignee: string, raw: Record<string, unknown>): void;
  close(): Promise<void>;
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const send = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const credentialsOf = (request: IncomingMessage): string | null => {
  const header = request.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) {
    return null;
  }
  return Buffer.from(header.slice(6), 'base64').toString('utf8');
};

const pageTokenOf = (body: unknown): number => {
  const token = (body as { nextPageToken?: unknown } | null)?.nextPageToken;
  return typeof token === 'string' ? Number(token.replace('page-', '')) : 0;
};

export const startJiraCloudStub = async (): Promise<JiraCloudStub> => {
  const users: JiraStubUser[] = [];
  const issues: JiraStubIssue[] = [];
  const requests: JiraStubRequest[] = [];
  const failures: JiraStubFailure[] = [];
  const state = { pageSize: 100 };

  const userOf = (request: IncomingMessage): JiraStubUser | null => {
    const credentials = credentialsOf(request);
    return users.find((user) => `${user.email}:${user.apiToken}` === credentials) ?? null;
  };

  const search = (user: JiraStubUser, body: unknown, response: ServerResponse): void => {
    const mine = issues.filter((issue) => issue.assignee === user.accountId);
    const requested = (body as { maxResults?: unknown } | null)?.maxResults;
    const size = Math.min(typeof requested === 'number' ? requested : 50, state.pageSize);
    const start = pageTokenOf(body);
    const page = mine.slice(start, start + size);
    const next = start + page.length;
    send(response, 200, {
      issues: page.map((issue) => issue.raw),
      ...(next < mine.length ? { nextPageToken: `page-${String(next)}` } : {}),
      isLast: next >= mine.length,
    });
  };

  const handle = (request: IncomingMessage, raw: string, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = parseJson(raw);
    requests.push({ method: request.method ?? 'GET', path: url.pathname, body });
    const failure = failures.shift();
    if (failure !== undefined) {
      send(response, failure.status, failure.body ?? { errorMessages: ['failure'] });
      return;
    }
    const user = userOf(request);
    if (user === null) {
      send(response, 401, 'Client must be authenticated to access this resource.');
      return;
    }
    if (request.method === 'GET' && url.pathname === '/rest/api/3/myself') {
      send(response, 200, {
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.email,
        active: true,
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/rest/api/3/search/jql') {
      search(user, body, response);
      return;
    }
    send(response, 404, { errorMessages: ['Not found'] });
  };

  const server = createServer((request, response) => {
    void readBody(request).then((raw) => {
      handle(request, raw, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    users,
    issues,
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
    issue: (assignee, raw) => {
      issues.push({ assignee, raw });
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

export const jiraStubIssue = (
  key: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: key.replace(/\D/g, '') || '1',
  key,
  fields: {
    summary: `Úloha ${key}`,
    status: { name: 'To Do', statusCategory: { key: 'new' } },
    priority: { name: 'Medium' },
    project: { key: key.split('-')[0], name: 'Acme' },
    duedate: null,
    updated: '2026-11-14T09:30:00.000+0100',
    ...overrides,
  },
});
