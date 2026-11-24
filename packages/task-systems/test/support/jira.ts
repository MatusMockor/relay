import type { JiraCloudStub } from '@relay/config/test-infra';
import type { TaskSystemAccess } from '@relay/engine';
import { JiraCloudAdapter, type JiraSitePolicy } from '../../src';

export const loopbackPolicy: JiraSitePolicy = { origin: (siteUrl) => new URL(siteUrl).origin };

export const ALICE = {
  email: 'alice@acme.test',
  apiToken: 'secret-token',
  accountId: '5b10ac8d82e05b22cc7d4ef5',
  displayName: 'Alice Novák',
};

export const accessFor = (stub: JiraCloudStub, apiToken = ALICE.apiToken): TaskSystemAccess => ({
  siteUrl: `${stub.url}/jira/your-work`,
  credentials: { provider: 'jira', email: ALICE.email, apiToken },
});

export const adapterFor = (stub: JiraCloudStub, maxIssues?: number) =>
  new JiraCloudAdapter({
    sitePolicy: loopbackPolicy,
    gatewayOrigin: stub.url,
    ...(maxIssues === undefined ? {} : { paging: { maxIssues } }),
  });
