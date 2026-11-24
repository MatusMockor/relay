import { type JiraCloudStub, jiraStubIssue, startJiraCloudStub } from '@relay/config/test-infra';
import { createTaskSystemRegistry } from '@relay/task-systems';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AesTestCipher } from './support/aes-test-cipher';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { createTempDir, type TempDir } from './support/temp-dir';

const ALICE = {
  email: 'alice@acme.test',
  apiToken: 'jira-token-1',
  accountId: 'jira-alice',
  displayName: 'Alice Novák',
};

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

describe('local mode task systems (SQLite + Jira stub)', () => {
  let dir: TempDir;
  let jira: JiraCloudStub;
  let harness: LocalRuntimeHarness;
  const cipher = new AesTestCipher();

  const start = () =>
    startLocalRuntime(dir, {
      cipher,
      taskSystems: createTaskSystemRegistry({
        jira: {
          sitePolicy: { origin: (siteUrl) => new URL(siteUrl).origin },
          gatewayOrigin: jira.url,
        },
      }),
    });

  beforeEach(async () => {
    dir = await createTempDir();
    jira = await startJiraCloudStub();
    jira.users.push(ALICE);
    jira.issue(ALICE.accountId, jiraStubIssue('ACME-3', { priority: { name: 'Blocker' } }));
    harness = start();
  });

  afterEach(async () => {
    await harness.close();
    await jira.close();
    await dir.remove();
  });

  it('connects over IPC, keeps the secret across a restart and lists tickets', async () => {
    const connection = expectOk(
      await harness.bridge.invoke('local.taskSystems.connect', {
        provider: 'jira',
        siteUrl: jira.url,
        email: ALICE.email,
        apiToken: ALICE.apiToken,
      }),
    );
    expect(connection).toMatchObject({ siteUrl: jira.url, accountName: 'Alice Novák' });
    expect(harness.events.map((event) => event.type)).toContain('taskSystems.updated');

    await harness.close();
    harness = start();

    expect(expectOk(await harness.bridge.invoke('local.taskSystems.list'))).toEqual([connection]);
    const tasks = expectOk(
      await harness.bridge.invoke('local.taskSystems.tasks', { connectionId: connection.id }),
    );
    expect(tasks.items.map((task) => [task.key, task.priority])).toEqual([['ACME-3', 'urgent']]);

    expectOk(
      await harness.bridge.invoke('local.taskSystems.disconnect', { connectionId: connection.id }),
    );
    expect(expectOk(await harness.bridge.invoke('local.taskSystems.list'))).toEqual([]);
  });

  it('answers a rejected token as forbidden', async () => {
    const result = await harness.bridge.invoke('local.taskSystems.connect', {
      provider: 'jira',
      siteUrl: jira.url,
      email: ALICE.email,
      apiToken: 'wrong',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });
});
