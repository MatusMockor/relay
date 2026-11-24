import { type JiraCloudStub, jiraStubIssue, startJiraCloudStub } from '@relay/config/test-infra';
import { ProviderError, ReauthorizationRequiredError, ValidationError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JiraCloudAdapter } from '../src';
import { accessFor, adapterFor, ALICE } from './support/jira';

describe('JiraCloudAdapter against a Jira Cloud stub', () => {
  let stub: JiraCloudStub;

  beforeEach(async () => {
    stub = await startJiraCloudStub();
    stub.users.push(ALICE);
  });

  afterEach(async () => {
    await stub.close();
  });

  it('verifies the account with basic auth and normalizes the site', async () => {
    const account = await adapterFor().verify(accessFor(stub));

    expect(account).toEqual({
      siteUrl: stub.url,
      externalAccountId: ALICE.accountId,
      accountName: ALICE.displayName,
    });
    expect(stub.requests).toEqual([{ method: 'GET', path: '/rest/api/3/myself', body: null }]);
  });

  it('rejects wrong credentials as an auth failure', async () => {
    await expect(adapterFor().verify(accessFor(stub, 'wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
    await expect(adapterFor().listMyOpenTasks(accessFor(stub, 'wrong'))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
  });

  it('pages through the search with nextPageToken and maps the issues', async () => {
    stub.pageSize = 2;
    stub.issue(
      ALICE.accountId,
      jiraStubIssue('ACME-1', {
        summary: 'Opraviť platby',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        priority: { name: 'Highest' },
        project: { key: 'ACME', name: 'Acme Web' },
        duedate: '2026-11-20',
        updated: '2026-11-14T09:30:00.000+0100',
      }),
    );
    stub.issue(ALICE.accountId, jiraStubIssue('ACME-2', { priority: { name: 'Minor' } }));
    stub.issue(ALICE.accountId, jiraStubIssue('ACME-3', { priority: null, duedate: 'soon' }));
    stub.issue('someone-else', jiraStubIssue('ACME-4'));

    const result = await adapterFor().listMyOpenTasks(accessFor(stub));

    expect(result.truncated).toBe(false);
    expect(result.tasks.map((task) => [task.key, task.priority])).toEqual([
      ['ACME-1', 'urgent'],
      ['ACME-2', 'low'],
      ['ACME-3', 'none'],
    ]);
    expect(result.tasks[0]).toEqual({
      externalId: '1',
      key: 'ACME-1',
      title: 'Opraviť platby',
      url: `${stub.url}/browse/ACME-1`,
      status: { name: 'In Progress', category: 'inProgress' },
      priority: 'urgent',
      projectName: 'Acme Web',
      dueDate: '2026-11-20',
      updatedAt: '2026-11-14T08:30:00.000Z',
    });
    expect(result.tasks[2]?.dueDate).toBeNull();
    const searches = stub.requests.filter((request) => request.path === '/rest/api/3/search/jql');
    expect(searches).toHaveLength(2);
    expect(searches[0]?.body).toEqual({
      jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC',
      fields: ['summary', 'status', 'priority', 'project', 'duedate', 'updated'],
      maxResults: 100,
    });
    expect(searches[1]?.body).toMatchObject({ nextPageToken: 'page-2' });
  });

  it('stops at the issue cap and reports the list as truncated', async () => {
    stub.pageSize = 2;
    for (const index of [1, 2, 3, 4, 5]) {
      stub.issue(ALICE.accountId, jiraStubIssue(`ACME-${String(index)}`));
    }

    const result = await adapterFor(3).listMyOpenTasks(accessFor(stub));

    expect(result.tasks.map((task) => task.key)).toEqual(['ACME-1', 'ACME-2', 'ACME-3']);
    expect(result.truncated).toBe(true);
  });

  it('fails on an invalid response', async () => {
    stub.failNext({ status: 200, body: { issues: [{ key: 'ACME-1' }] } });
    await expect(adapterFor().listMyOpenTasks(accessFor(stub))).rejects.toThrow(
      'Jira vrátila neplatnú odpoveď.',
    );
    stub.failNext({ status: 200, body: 'not json' });
    await expect(adapterFor().verify(accessFor(stub))).rejects.toThrow(ProviderError);
  });

  it('maps server failures', async () => {
    stub.failNext({ status: 429 });
    await expect(adapterFor().listMyOpenTasks(accessFor(stub))).rejects.toThrow(ProviderError);
    stub.failNext({ status: 404 });
    await expect(adapterFor().verify(accessFor(stub))).rejects.toThrow(ValidationError);
    stub.failNext({ status: 403 });
    await expect(adapterFor().verify(accessFor(stub))).rejects.toThrow(
      ReauthorizationRequiredError,
    );
  });

  it('reports an unreachable site as a provider error', async () => {
    const url = stub.url;
    await stub.close();
    const adapter = adapterFor();

    await expect(adapter.verify({ ...accessFor(stub), siteUrl: url })).rejects.toThrow(
      ProviderError,
    );
    stub = await startJiraCloudStub();
  });

  it('never calls a site outside the Atlassian policy', async () => {
    const adapter = new JiraCloudAdapter();

    await expect(adapter.verify(accessFor(stub))).rejects.toThrow(ValidationError);
    await expect(adapter.listMyOpenTasks(accessFor(stub))).rejects.toThrow(ValidationError);
    expect(stub.requests).toEqual([]);
  });
});
