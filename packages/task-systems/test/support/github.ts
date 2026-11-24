import type { GitHubStub } from '@relay/config/test-infra';
import type { TaskSystemAccess } from '@relay/engine';
import { GitHubIssuesAdapter, type GitHubIssuesAdapterOptions } from '../../src';

export const GITHUB_ALICE = {
  token: 'github_pat_alice',
  id: 583231,
  login: 'alice',
  name: 'Alice Novák',
};

export const githubAccess = (token = GITHUB_ALICE.token): TaskSystemAccess => ({
  siteUrl: 'https://github.com',
  credentials: { provider: 'github', token },
});

export const githubAdapterFor = (
  stub: GitHubStub,
  paging: GitHubIssuesAdapterOptions['paging'] = {},
) => new GitHubIssuesAdapter({ apiOrigin: stub.url, paging });
