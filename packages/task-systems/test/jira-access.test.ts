import { type JiraCloudStub, jiraStubIssue, startJiraCloudStub } from '@relay/config/test-infra';
import { ProviderError, ReauthorizationRequiredError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JiraCloudAdapter } from '../src';
import { accessFor, ALICE, loopbackPolicy } from './support/jira';

describe('Jira access modes and denied searches', () => {
  let stub: JiraCloudStub;

  const adapter = () =>
    new JiraCloudAdapter({ sitePolicy: loopbackPolicy, gatewayOrigin: stub.url });

  beforeEach(async () => {
    stub = await startJiraCloudStub();
  });

  afterEach(async () => {
    await stub.close();
  });

  it('falls back to the API gateway for a scoped token and lists through it', async () => {
    stub.users.push({ ...ALICE, scoped: true });
    stub.issue(ALICE.accountId, jiraStubIssue('ACME-5'));

    const account = await adapter().verify(accessFor(stub));

    expect(account.credentials).toEqual({
      ...accessFor(stub).credentials,
      route: { kind: 'gateway', cloudId: stub.cloudId },
    });
    expect(stub.requests.map((request) => request.path)).toEqual([
      '/rest/api/3/myself',
      '/_edge/tenant_info',
      `/ex/jira/${stub.cloudId}/rest/api/3/myself`,
      `/ex/jira/${stub.cloudId}/rest/api/3/search/jql`,
    ]);

    const list = await adapter().listMyOpenTasks({
      siteUrl: accessFor(stub).siteUrl,
      credentials: account.credentials ?? accessFor(stub).credentials,
    });

    expect(list.tasks.map((task) => task.url)).toEqual([`${stub.url}/browse/ACME-5`]);
    expect(stub.requests.at(-1)?.path).toBe(`/ex/jira/${stub.cloudId}/rest/api/3/search/jql`);
  });

  it('keeps the classic route for a classic token', async () => {
    stub.users.push(ALICE);

    const account = await adapter().verify(accessFor(stub));

    expect(account.credentials).toMatchObject({ route: { kind: 'site' } });
    expect(stub.requests.some((request) => request.path === '/_edge/tenant_info')).toBe(false);
  });

  it('rejects wrong credentials on both routes as an auth failure', async () => {
    stub.users.push({ ...ALICE, scoped: true });

    await expect(adapter().verify(accessFor(stub, 'wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
  });

  it('fails the connect when the account may not search issues', async () => {
    stub.users.push(ALICE);
    stub.failNext({ status: 200, body: { accountId: ALICE.accountId } });
    stub.failNext({ status: 403 });

    await expect(adapter().verify(accessFor(stub))).rejects.toThrow(
      'Účet nemá v Jira prístup k vyhľadávaniu úloh.',
    );
  });

  it('reports a denied search as a provider error, not as rejected credentials', async () => {
    stub.users.push(ALICE);
    stub.failNext({ status: 403 });

    const failure = adapter()
      .listMyOpenTasks(accessFor(stub))
      .catch((error: unknown) => error);

    expect(await failure).toBeInstanceOf(ProviderError);
    expect(await failure).not.toBeInstanceOf(ReauthorizationRequiredError);
  });
});
