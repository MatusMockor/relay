import { type GitHubStub, gitHubStubIssue, startGitHubStub } from '@relay/config/test-infra';
import { ProviderError, RateLimitedError, ReauthorizationRequiredError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GITHUB_ALICE, githubAccess, githubAdapterFor } from './support/github';

const label = (name: string) => ({ id: name.length, name, color: 'ededed' });

describe('GitHubIssuesAdapter against a GitHub REST stub', () => {
  let stub: GitHubStub;

  beforeEach(async () => {
    stub = await startGitHubStub();
    stub.users.push(GITHUB_ALICE);
  });

  afterEach(async () => {
    await stub.close();
  });

  it('verifies the token with the GitHub REST headers', async () => {
    const account = await githubAdapterFor(stub).verify(githubAccess());

    expect(account).toEqual({
      siteUrl: 'https://github.com',
      externalAccountId: '583231',
      accountName: 'Alice Novák',
      defaultLabel: 'alice',
    });
    const headers = {
      authorization: `Bearer ${GITHUB_ALICE.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    };
    expect(stub.requests).toEqual([
      { method: 'GET', path: '/user', query: {}, headers },
      {
        method: 'GET',
        path: '/issues',
        query: { filter: 'assigned', state: 'open', per_page: '1', sort: 'updated' },
        headers,
      },
    ]);
  });

  it('maps only 401 to rejected credentials, 403 to rate limits or access denied', async () => {
    const adapter = githubAdapterFor(stub);

    await expect(adapter.verify(githubAccess('wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
    await expect(adapter.listMyOpenTasks(githubAccess('wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
    stub.failNext({ status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    await expect(adapter.listMyOpenTasks(githubAccess())).rejects.toThrow(RateLimitedError);
    stub.failNext({
      status: 403,
      body: { message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' },
    });
    await expect(adapter.listMyOpenTasks(githubAccess())).rejects.toThrow(
      'GitHub dočasne obmedzil počet požiadaviek, skús to znova o chvíľu.',
    );
    stub.failNext({ status: 403, body: { message: 'Resource not accessible' } });
    const denied = adapter.verify(githubAccess());
    await expect(denied).rejects.toThrow(/GitHub túto požiadavku pre tento token nepovolil/);
    await expect(denied).rejects.not.toThrow(ReauthorizationRequiredError);
    stub.failNext({ status: 429, headers: { 'retry-after': '60' } });
    await expect(adapter.verify(githubAccess())).rejects.toThrow(RateLimitedError);
    stub.failNext({ status: 500 });
    await expect(adapter.verify(githubAccess())).rejects.toThrow('GitHub vrátil stav 500.');
  });

  it('follows the Link header, skips pull requests and maps the issues', async () => {
    stub.pageSize = 2;
    stub.issue(
      'alice',
      gitHubStubIssue('acme/web-platform', 1234, {
        title: 'Opraviť export',
        labels: [label('bug'), label('Priority: High'), label('In Progress'), label('P0')],
        milestone: { title: 'v2', due_on: '2026-11-20T08:00:00Z' },
        updated_at: '2026-11-14T09:30:00Z',
      }),
    );
    stub.issue('alice', { ...gitHubStubIssue('acme/web', 7), pull_request: { url: 'x' } });
    stub.issue('alice', gitHubStubIssue('acme/api', 3, { labels: ['p3'], repository: null }));
    stub.issue('bob', gitHubStubIssue('acme/api', 4));

    const result = await githubAdapterFor(stub).listMyOpenTasks(githubAccess());

    expect(result).toEqual({
      tasks: [
        {
          externalId: '2234',
          key: 'acme/web-platform#1234',
          title: 'Opraviť export',
          url: 'https://github.com/acme/web-platform/issues/1234',
          status: { name: 'In Progress', category: 'inProgress' },
          priority: 'high',
          projectName: 'acme/web-platform',
          dueDate: '2026-11-20',
          updatedAt: '2026-11-14T09:30:00.000Z',
        },
        expect.objectContaining({
          key: 'acme/api#3',
          status: { name: 'Open', category: 'todo' },
          priority: 'low',
          projectName: 'acme/api',
          dueDate: null,
        }),
      ],
      truncated: false,
    });
    const searches = stub.requests.filter((request) => request.path === '/issues');
    expect(searches.map((request) => request.query)).toEqual([
      { filter: 'assigned', state: 'open', per_page: '100', sort: 'updated' },
      { filter: 'assigned', state: 'open', per_page: '100', sort: 'updated', page: '2' },
    ]);
  });

  it('stops at the issue cap and reports the list as truncated', async () => {
    stub.pageSize = 2;
    for (const number of [1, 2, 3, 4, 5]) {
      stub.issue('alice', gitHubStubIssue('acme/web', number));
    }

    const result = await githubAdapterFor(stub, { maxIssues: 3 }).listMyOpenTasks(githubAccess());

    expect(result.tasks.map((task) => task.key)).toEqual([
      'acme/web#1',
      'acme/web#2',
      'acme/web#3',
    ]);
    expect(result.truncated).toBe(true);
  });

  it('stops after the page cap when only pull requests keep coming', async () => {
    stub.pageSize = 1;
    for (const number of [1, 2, 3]) {
      stub.issue('alice', { ...gitHubStubIssue('acme/web', number), pull_request: {} });
    }

    const result = await githubAdapterFor(stub, { maxPages: 2 }).listMyOpenTasks(githubAccess());

    expect(result).toEqual({ tasks: [], truncated: true });
    expect(stub.requests).toHaveLength(2);
  });

  it('never follows a next link to another origin', async () => {
    stub.pageSize = 1;
    stub.nextLinkOrigin = 'https://evil.test';
    stub.issue('alice', gitHubStubIssue('acme/web', 1));
    stub.issue('alice', gitHubStubIssue('acme/web', 2));

    await expect(githubAdapterFor(stub).listMyOpenTasks(githubAccess())).rejects.toThrow(
      ProviderError,
    );
    expect(stub.requests).toHaveLength(1);
  });

  it('fails on an invalid response', async () => {
    stub.failNext({ status: 200, body: [{ number: 1 }] });
    await expect(githubAdapterFor(stub).listMyOpenTasks(githubAccess())).rejects.toThrow(
      'GitHub vrátil neplatnú odpoveď.',
    );
    stub.failNext({ status: 200, body: 'not json' });
    await expect(githubAdapterFor(stub).verify(githubAccess())).rejects.toThrow(ProviderError);
  });
});
