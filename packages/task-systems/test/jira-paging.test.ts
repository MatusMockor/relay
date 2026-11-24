import { type JiraCloudStub, jiraStubIssue, startJiraCloudStub } from '@relay/config/test-infra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JiraCloudAdapter } from '../src';
import { accessFor, ALICE, loopbackPolicy } from './support/jira';

const page = (keys: readonly string[], nextPageToken?: string) => ({
  status: 200,
  body: {
    issues: keys.map((key) => jiraStubIssue(key)),
    ...(nextPageToken === undefined ? {} : { nextPageToken }),
  },
});

describe('Jira search paging bounds', () => {
  let stub: JiraCloudStub;

  const list = (maxRequests = 10) =>
    new JiraCloudAdapter({
      sitePolicy: loopbackPolicy,
      gatewayOrigin: stub.url,
      paging: { maxRequests },
    }).listMyOpenTasks(accessFor(stub));

  beforeEach(async () => {
    stub = await startJiraCloudStub();
    stub.users.push(ALICE);
  });

  afterEach(async () => {
    await stub.close();
  });

  it('keeps paging through an empty page that still has a next token', async () => {
    stub.failNext(page(['ACME-1'], 'a'));
    stub.failNext(page([], 'b'));
    stub.failNext(page(['ACME-2']));

    expect(await list()).toMatchObject({
      tasks: [{ key: 'ACME-1' }, { key: 'ACME-2' }],
      truncated: false,
    });
  });

  it('stops on a repeated token and reports the list as truncated', async () => {
    stub.failNext(page(['ACME-1'], 'a'));
    stub.failNext(page(['ACME-2'], 'a'));

    expect(await list()).toMatchObject({
      tasks: [{ key: 'ACME-1' }, { key: 'ACME-2' }],
      truncated: true,
    });
    expect(stub.requests).toHaveLength(2);
  });

  it('stops after the request budget', async () => {
    stub.failNext(page([], 'a'));
    stub.failNext(page([], 'b'));
    stub.failNext(page([], 'c'));

    expect(await list(2)).toEqual({ tasks: [], truncated: true });
    expect(stub.requests).toHaveLength(2);
  });
});
