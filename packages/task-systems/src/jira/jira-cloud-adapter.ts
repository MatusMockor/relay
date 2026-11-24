import type {
  RemoteTaskList,
  TaskSystemAccess,
  TaskSystemAccount,
  TaskSystemAdapter,
} from '@relay/engine';
import type { JiraCredentials, TaskSystemProvider } from '@relay/shared/domain';
import { JiraApiClient, type JiraApiClientOptions } from './jira-api-client';
import { JiraMyselfSchema } from './jira-api-schemas';
import { DEFAULT_JIRA_PAGING, type JiraPaging, listMyOpenIssues } from './jira-open-issues';
import { AtlassianSitePolicy, type JiraSitePolicy } from './jira-site-policy';

export interface JiraCloudAdapterOptions extends JiraApiClientOptions {
  readonly sitePolicy?: JiraSitePolicy;
  readonly paging?: Partial<JiraPaging>;
}

const jiraCredentials = (access: TaskSystemAccess): JiraCredentials => access.credentials;

export class JiraCloudAdapter implements TaskSystemAdapter {
  readonly provider: TaskSystemProvider = 'jira';
  private readonly api: JiraApiClient;
  private readonly sitePolicy: JiraSitePolicy;
  private readonly paging: JiraPaging;

  constructor(options: JiraCloudAdapterOptions = {}) {
    this.api = new JiraApiClient(options);
    this.sitePolicy = options.sitePolicy ?? new AtlassianSitePolicy();
    this.paging = { ...DEFAULT_JIRA_PAGING, ...options.paging };
  }

  async verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    const credentials = jiraCredentials(access);
    const origin = this.sitePolicy.origin(access.siteUrl);
    const myself = await this.api.send(
      { origin, credentials, method: 'GET', path: '/rest/api/3/myself' },
      JiraMyselfSchema,
    );
    return {
      siteUrl: origin,
      externalAccountId: myself.accountId,
      accountName: myself.displayName ?? myself.emailAddress ?? credentials.email,
    };
  }

  async listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList> {
    const credentials = jiraCredentials(access);
    const origin = this.sitePolicy.origin(access.siteUrl);
    return await listMyOpenIssues(this.api, origin, credentials, this.paging);
  }
}
