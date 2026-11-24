import {
  type GitHubStub,
  gitHubStubIssue,
  type LinearStub,
  linearStubIssue,
  startGitHubStub,
  startLinearStub,
} from '@relay/config/test-infra';
import { createTaskSystemRegistry } from '@relay/task-systems';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AesTestCipher } from './support/aes-test-cipher';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { createTempDir, type TempDir } from './support/temp-dir';

const LINEAR_USER = { apiKey: 'lin_api_1', id: 'lin-alice', name: 'Alice', email: 'a@acme.test' };
const GITHUB_USER = { token: 'github_pat_1', id: 42, login: 'alice', name: 'Alice' };

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode Linear and GitHub Issues (SQLite + stubs)', () => {
  let dir: TempDir;
  let linear: LinearStub;
  let github: GitHubStub;
  let harness: LocalRuntimeHarness;
  const cipher = new AesTestCipher();

  const start = () =>
    startLocalRuntime(dir, {
      cipher,
      taskSystems: createTaskSystemRegistry({
        linear: { apiUrl: linear.apiUrl },
        github: { apiOrigin: github.url },
      }),
    });

  beforeEach(async () => {
    dir = await createTempDir();
    linear = await startLinearStub();
    linear.users.push(LINEAR_USER);
    linear.issue(LINEAR_USER.id, linearStubIssue('ENG-5', { priority: 1 }));
    github = await startGitHubStub();
    github.users.push(GITHUB_USER);
    github.issue('alice', gitHubStubIssue('acme/web', 8, { labels: ['priority: low'] }));
    harness = start();
  });

  afterEach(async () => {
    await harness.close();
    await linear.close();
    await github.close();
    await dir.remove();
  });

  it('connects both over IPC, keeps the secrets across a restart and lists tickets', async () => {
    const linearConnection = expectOk(
      await harness.bridge.invoke('local.taskSystems.connect', {
        provider: 'linear',
        apiKey: LINEAR_USER.apiKey,
      }),
    );
    const githubConnection = expectOk(
      await harness.bridge.invoke('local.taskSystems.connect', {
        provider: 'github',
        token: GITHUB_USER.token,
      }),
    );
    expect(linearConnection).toMatchObject({ label: 'Acme', siteUrl: 'https://linear.app/acme' });
    expect(githubConnection).toMatchObject({ label: 'alice', siteUrl: 'https://github.com' });

    await harness.close();
    harness = start();

    expect(expectOk(await harness.bridge.invoke('local.taskSystems.list'))).toEqual([
      linearConnection,
      githubConnection,
    ]);
    const linearTasks = expectOk(
      await harness.bridge.invoke('local.taskSystems.tasks', {
        connectionId: linearConnection.id,
      }),
    );
    const githubTasks = expectOk(
      await harness.bridge.invoke('local.taskSystems.tasks', {
        connectionId: githubConnection.id,
      }),
    );
    expect(linearTasks.items.map((task) => [task.key, task.priority])).toEqual([
      ['ENG-5', 'urgent'],
    ]);
    expect(githubTasks.items.map((task) => [task.key, task.priority])).toEqual([
      ['acme/web#8', 'low'],
    ]);

    expectOk(
      await harness.bridge.invoke('local.taskSystems.disconnect', {
        connectionId: githubConnection.id,
      }),
    );
    expect(expectOk(await harness.bridge.invoke('local.taskSystems.list'))).toEqual([
      linearConnection,
    ]);
  });

  it('answers a rejected GitHub token as forbidden', async () => {
    const result = await harness.bridge.invoke('local.taskSystems.connect', {
      provider: 'github',
      token: 'wrong',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });
});
