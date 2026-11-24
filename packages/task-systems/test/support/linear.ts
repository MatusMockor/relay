import type { LinearStub } from '@relay/config/test-infra';
import type { TaskSystemAccess } from '@relay/engine';
import { LinearAdapter } from '../../src';

export const LINEAR_ALICE = {
  apiKey: 'lin_api_alice',
  id: 'user-alice',
  name: 'Alice Novák',
  email: 'alice@acme.test',
};

export const linearAccess = (apiKey = LINEAR_ALICE.apiKey): TaskSystemAccess => ({
  siteUrl: 'https://linear.app',
  credentials: { provider: 'linear', apiKey },
});

export const linearAdapterFor = (stub: LinearStub, maxIssues?: number) =>
  new LinearAdapter({
    apiUrl: stub.apiUrl,
    ...(maxIssues === undefined ? {} : { paging: { maxIssues } }),
  });
