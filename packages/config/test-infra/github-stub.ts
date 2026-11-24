import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, startStubServer, type StubFailure } from './stub-http';

export interface GitHubStubUser {
  readonly token: string;
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
}

export interface GitHubStubRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

export interface GitHubStub {
  readonly url: string;
  readonly users: GitHubStubUser[];
  readonly requests: GitHubStubRequest[];
  pageSize: number;
  nextLinkOrigin: string | null;
  failNext(failure: StubFailure): void;
  issue(assigneeLogin: string, raw: Record<string, unknown>): void;
  close(): Promise<void>;
}

const requestOf = (incoming: IncomingMessage, url: URL): GitHubStubRequest => ({
  method: incoming.method ?? 'GET',
  path: url.pathname,
  query: Object.fromEntries(url.searchParams),
  headers: {
    authorization: incoming.headers.authorization,
    accept: incoming.headers.accept,
    'x-github-api-version': incoming.headers['x-github-api-version'] as string | undefined,
  },
});

export const startGitHubStub = async (): Promise<GitHubStub> => {
  const users: GitHubStubUser[] = [];
  const issues: { readonly assignee: string; readonly raw: Record<string, unknown> }[] = [];
  const requests: GitHubStubRequest[] = [];
  const failures: StubFailure[] = [];
  const state: { pageSize: number; nextLinkOrigin: string | null; url: string } = {
    pageSize: 100,
    nextLinkOrigin: null,
    url: '',
  };

  const listIssues = (user: GitHubStubUser, url: URL, response: ServerResponse) => {
    const mine = issues.filter((issue) => issue.assignee === user.login);
    const perPage = Math.min(Number(url.searchParams.get('per_page') ?? '30'), state.pageSize);
    const page = Number(url.searchParams.get('page') ?? '1');
    const items = mine.slice((page - 1) * perPage, page * perPage);
    const headers: Record<string, string> = {};
    if (page * perPage < mine.length) {
      const next = new URL(url.toString());
      next.searchParams.set('page', String(page + 1));
      const origin = state.nextLinkOrigin ?? state.url;
      headers.link = `<${origin}${next.pathname}${next.search}>; rel="next", <${origin}/issues?page=99>; rel="last"`;
    }
    sendJson(
      response,
      200,
      items.map((issue) => issue.raw),
      headers,
    );
  };

  const server = await startStubServer((incoming, _raw, response) => {
    const url = new URL(incoming.url ?? '/', 'http://127.0.0.1');
    requests.push(requestOf(incoming, url));
    const failure = failures.shift();
    if (failure !== undefined) {
      const body = failure.body ?? { message: 'Bad credentials' };
      sendJson(response, failure.status, body, failure.headers);
      return;
    }
    const user = users.find((item) => `Bearer ${item.token}` === incoming.headers.authorization);
    if (user === undefined) {
      sendJson(response, 401, { message: 'Bad credentials', status: '401' });
      return;
    }
    if (url.pathname === '/user') {
      sendJson(response, 200, { id: user.id, login: user.login, name: user.name });
      return;
    }
    if (url.pathname === '/issues') {
      listIssues(user, url, response);
      return;
    }
    sendJson(response, 404, { message: 'Not Found' });
  });
  state.url = server.url;
  return {
    url: server.url,
    users,
    requests,
    get pageSize() {
      return state.pageSize;
    },
    set pageSize(value: number) {
      state.pageSize = value;
    },
    get nextLinkOrigin() {
      return state.nextLinkOrigin;
    },
    set nextLinkOrigin(value: string | null) {
      state.nextLinkOrigin = value;
    },
    failNext: (failure) => {
      failures.push(failure);
    },
    issue: (assigneeLogin, raw) => {
      issues.push({ assignee: assigneeLogin, raw });
    },
    close: server.close,
  };
};

export const gitHubStubIssue = (
  repository: string,
  number: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  id: 1000 + number,
  number,
  title: `Issue ${repository}#${String(number)}`,
  html_url: `https://github.com/${repository}/issues/${String(number)}`,
  state: 'open',
  labels: [],
  repository: { full_name: repository },
  repository_url: `https://api.github.com/repos/${repository}`,
  milestone: null,
  updated_at: '2026-11-14T08:30:00Z',
  ...overrides,
});
