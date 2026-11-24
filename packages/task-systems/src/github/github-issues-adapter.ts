import type {
  RemoteTaskList,
  TaskSystemAccess,
  TaskSystemAccount,
  TaskSystemAdapter,
} from '@relay/engine';
import type { TaskSystemProvider } from '@relay/shared/domain';
import { credentialsOf } from '../shared/credentials';
import { clipOrNull } from '../shared/text';
import { GitHubApiClient, type GitHubApiClientOptions } from './github-api-client';
import { GitHubUserSchema } from './github-api-schemas';
import {
  DEFAULT_GITHUB_PAGING,
  type GitHubPaging,
  listMyOpenGitHubIssues,
} from './github-open-issues';

export const GITHUB_SITE_URL = 'https://github.com';

export interface GitHubIssuesAdapterOptions extends GitHubApiClientOptions {
  readonly paging?: Partial<GitHubPaging>;
}

export class GitHubIssuesAdapter implements TaskSystemAdapter {
  readonly provider: TaskSystemProvider = 'github';
  private readonly api: GitHubApiClient;
  private readonly paging: GitHubPaging;

  constructor(options: GitHubIssuesAdapterOptions = {}) {
    this.api = new GitHubApiClient(options);
    this.paging = { ...DEFAULT_GITHUB_PAGING, ...options.paging };
  }

  async verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    const credentials = credentialsOf(access, 'github');
    const { data: user } = await this.api.get(credentials, '/user', GitHubUserSchema);
    return {
      siteUrl: GITHUB_SITE_URL,
      externalAccountId: String(user.id),
      accountName: clipOrNull(user.name, 255) ?? user.login,
      defaultLabel: user.login,
    };
  }

  async listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList> {
    const credentials = credentialsOf(access, 'github');
    return await listMyOpenGitHubIssues(this.api, credentials, this.paging);
  }
}
