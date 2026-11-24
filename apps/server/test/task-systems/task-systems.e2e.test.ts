import { randomUUID } from 'node:crypto';
import { type JiraCloudStub, jiraStubIssue, startJiraCloudStub } from '@relay/config/test-infra';
import { createTaskSystemRegistry } from '@relay/task-systems';
import { api } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const ALICE = {
  email: 'alice@acme.test',
  apiToken: 'jira-token-1',
  accountId: 'jira-alice',
  displayName: 'Alice Novák',
};

const email = (): string => `jira-${randomUUID().slice(0, 8)}@relay.test`;

describe('task systems over HTTP (Jira stub)', () => {
  let app: TestApp;
  let jira: JiraCloudStub;

  beforeAll(async () => {
    jira = await startJiraCloudStub();
    jira.users.push(ALICE);
    jira.issue(
      ALICE.accountId,
      jiraStubIssue('ACME-7', {
        summary: 'Nasadiť opravu',
        priority: { name: 'High' },
        status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
      }),
    );
    app = await startTestApp({
      taskSystems: createTaskSystemRegistry({
        jira: {
          sitePolicy: { origin: (siteUrl) => new URL(siteUrl).origin },
          gatewayOrigin: jira.url,
        },
      }),
    });
  });

  afterAll(async () => {
    await app.close();
    await jira.close();
  });

  it('connects, lists my open tickets, survives a revoked token and disconnects', async () => {
    const session = await registerUser(app.api, email());
    const token = session.accessToken;
    const realtime = await authenticateRealtime(app.baseUrl, token);
    const body = {
      provider: 'jira',
      siteUrl: `${jira.url}/jira/your-work`,
      email: ALICE.email,
      apiToken: ALICE.apiToken,
      label: 'Acme Jira',
    } as const;

    const rejected = await app.api.fail(
      api.taskSystems.connect,
      { body: { ...body, apiToken: 'wrong' } },
      token,
    );
    expect(rejected).toMatchObject({ status: 403, error: { code: 'forbidden' } });

    const connection = await app.api.ok(api.taskSystems.connect, { body }, token);
    expect(connection).toMatchObject({
      provider: 'jira',
      label: 'Acme Jira',
      siteUrl: jira.url,
      accountName: 'Alice Novák',
      status: 'ok',
    });
    expect(JSON.stringify(connection)).not.toContain(ALICE.apiToken);
    await realtime.waitFor(
      (message) => message.type === 'event' && message.event.type === 'taskSystems.updated',
    );
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([connection]);

    const tasks = await app.api.ok(api.taskSystems.tasks, { params: { id: connection.id } }, token);
    expect(tasks).toEqual({
      items: [
        expect.objectContaining({
          connectionId: connection.id,
          key: 'ACME-7',
          title: 'Nasadiť opravu',
          priority: 'high',
          status: { name: 'In Review', category: 'inProgress' },
          url: `${jira.url}/browse/ACME-7`,
        }),
      ],
      truncated: false,
    });

    const stranger = await registerUser(app.api, email());
    expect(
      await app.api.fail(
        api.taskSystems.tasks,
        { params: { id: connection.id } },
        stranger.accessToken,
      ),
    ).toMatchObject({ status: 404 });

    jira.failNext({ status: 403 });
    expect(
      await app.api.fail(api.taskSystems.tasks, { params: { id: connection.id } }, token),
    ).toMatchObject({ status: 502, error: { code: 'provider_error' } });
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([
      expect.objectContaining({ id: connection.id, status: 'ok' }),
    ]);

    jira.failNext({ status: 401 });
    expect(
      await app.api.fail(api.taskSystems.tasks, { params: { id: connection.id } }, token),
    ).toMatchObject({ status: 403, error: { code: 'forbidden' } });
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([
      expect.objectContaining({ id: connection.id, status: 'error' }),
    ]);

    await app.api.ok(api.taskSystems.disconnect, { params: { id: connection.id } }, token);
    expect(await app.api.ok(api.taskSystems.list, {}, token)).toEqual([]);
    realtime.close();
  });

  it('refuses sites outside the Atlassian policy with the production registry', async () => {
    const production = await startTestApp();
    const session = await registerUser(production.api, email());
    const before = jira.requests.length;
    try {
      const failure = await production.api.fail(
        api.taskSystems.connect,
        {
          body: {
            provider: 'jira',
            siteUrl: jira.url,
            email: ALICE.email,
            apiToken: ALICE.apiToken,
          },
        },
        session.accessToken,
      );
      expect(failure).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
      expect(jira.requests).toHaveLength(before);
    } finally {
      await production.close();
    }
  });
});
