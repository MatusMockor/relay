import type {
  RemoteTaskList,
  TaskSystemAccess,
  TaskSystemAccount,
  TaskSystemAdapter,
} from '@relay/engine';
import type { TaskSystemProvider } from '@relay/shared/domain';
import { credentialsOf } from '../shared/credentials';
import { DEFAULT_TASK_PAGING, type TaskPaging } from '../shared/task-paging';
import { clipOrNull } from '../shared/text';
import { GitHubApiClient, type GitHubApiClientOptions } from './github-api-client';
import { GitHubIssueListSchema, GitHubUserSchema } from './github-api-schemas';
import { assignedIssuesPath, listMyOpenGitHubIssues } from './github-open-issues';

export const GITHUB_SITE_URL = 'https://github.com';

export interface GitHubIssuesAdapterOptions extends GitHubApiClientOptions {
  readonly paging?: Partial<TaskPaging>;
}

export class GitHubIssuesAdapter implements TaskSystemAdapter {
  readonly provider: TaskSystemProvider = 'github';
  private readonly api: GitHubApiClient;
  private readonly paging: TaskPaging;

  constructor(options: GitHubIssuesAdapterOptions = {}) {
    this.api = new GitHubApiClient(options);
    this.paging = { ...DEFAULT_TASK_PAGING, ...options.paging };
  }

  async verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    const credentials = credentialsOf(access, 'github');
    const { data: user } = await this.api.get(credentials, '/user', GitHubUserSchema);
    await this.api.get(credentials, assignedIssuesPath(1), GitHubIssueListSchema);
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
