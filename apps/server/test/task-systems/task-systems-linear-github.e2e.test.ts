import { randomUUID } from 'node:crypto';
import {
  type GitHubStub,
  gitHubStubIssue,
  type LinearStub,
  linearStubIssue,
  startGitHubStub,
  startLinearStub,
} from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import { createTaskSystemRegistry } from '@relay/task-systems';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const LINEAR_USER = { apiKey: 'lin_api_1', id: 'lin-alice', name: 'Alice', email: 'a@acme.test' };
const GITHUB_USER = { token: 'github_pat_1', id: 42, login: 'alice', name: null };

const email = (): string => `ts-${randomUUID().slice(0, 8)}@relay.test`;

describe('task systems over HTTP (Linear and GitHub stubs)', () => {
  let app: TestApp;
  let linear: LinearStub;
  let github: GitHubStub;

  beforeAll(async () => {
    linear = await startLinearStub();
    linear.users.push(LINEAR_USER);
    linear.issue(
      LINEAR_USER.id,
      linearStubIssue('ENG-9', { priority: 2, state: { name: 'In Review', type: 'started' } }),
    );
    github = await startGitHubStub();
    github.users.push(GITHUB_USER);
    github.issue('alice', gitHubStubIssue('acme/web', 12, { labels: [{ name: 'P1' }] }));
    github.issue('alice', { ...gitHubStubIssue('acme/web', 13), pull_request: {} });
    app = await startTestApp({
      taskSystems: createTaskSystemRegistry({
        linear: { apiUrl: linear.apiUrl },
        github: { apiOrigin: github.url },
      }),
    });
  });

  afterAll(async () => {
    await app.close();
    await linear.close();
    await github.close();
  });

  it('connects Linear with an API key and lists my open issues', async () => {
    const token = (await registerUser(app.api, email())).accessToken;

    const rejected = await app.api.fail(
      api.taskSystems.connect,
      { body: { provider: 'linear', apiKey: 'wrong' } },
      token,
    );
    expect(rejected).toMatchObject({ status: 403, error: { code: 'forbidden' } });

    const connection = await app.api.ok(
      api.taskSystems.connect,
      { body: { provider: 'linear', apiKey: LINEAR_USER.apiKey } },
      token,
    );
    expect(connection).toMatchObject({
      provider: 'linear',
      label: 'Acme',
      siteUrl: 'https://linear.app/acme',
      accountName: 'Alice',
      status: 'ok',
    });
    expect(JSON.stringify(connection)).not.toContain(LINEAR_USER.apiKey);

    const tasks = await app.api.ok(api.taskSystems.tasks, { params: { id: connection.id } }, token);
    expect(tasks).toEqual({
      items: [
        expect.objectContaining({
          connectionId: connection.id,
          provider: 'linear',
          key: 'ENG-9',
          priority: 'high',
          status: { name: 'In Review', category: 'inProgress' },
          projectName: 'Engineering',
        }),
      ],
      truncated: false,
    });

    linear.failNext({ status: 400 });
    expect(
      await app.api.fail(api.taskSystems.tasks, { params: { id: connection.id } }, token),
    ).toMatchObject({ status: 403, error: { code: 'forbidden' } });
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([
      expect.objectContaining({ id: connection.id, status: 'error' }),
    ]);
    await app.api.ok(api.taskSystems.disconnect, { params: { id: connection.id } }, token);
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([]);
  });

  it('connects GitHub Issues with a token and lists issues without pull requests', async () => {
    const token = (await registerUser(app.api, email())).accessToken;

    const connection = await app.api.ok(
      api.taskSystems.connect,
      { body: { provider: 'github', token: GITHUB_USER.token, label: 'Môj GitHub' } },
      token,
    );
    expect(connection).toMatchObject({
      provider: 'github',
      label: 'Môj GitHub',
      siteUrl: 'https://github.com',
      accountName: 'alice',
    });

    const tasks = await app.api.ok(api.taskSystems.tasks, { params: { id: connection.id } }, token);
    expect(tasks.items.map((task) => [task.key, task.priority, task.url])).toEqual([
      ['acme/web#12', 'high', 'https://github.com/acme/web/issues/12'],
    ]);

    await app.api.ok(api.taskSystems.disconnect, { params: { id: connection.id } }, token);
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([]);
  });

  it('rejects a GitHub connect input without a token', async () => {
    const token = (await registerUser(app.api, email())).accessToken;

    const failure = await app.api.fail(
      api.taskSystems.connect,
      { body: { provider: 'github', token: ' ' } },
      token,
    );

    expect(failure).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
  });
});
