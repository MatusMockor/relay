import type {
  RemoteTaskList,
  TaskSystemAccess,
  TaskSystemAccount,
  TaskSystemAdapter,
} from '@relay/engine';
import type { JiraCredentials, TaskSystemProvider } from '@relay/shared/domain';
import { JiraApiClient, type JiraApiClientOptions } from './jira-api-client';
import { DEFAULT_JIRA_PAGING, type JiraPaging, listMyOpenIssues } from './jira-open-issues';
import { ATLASSIAN_API_GATEWAY, endpointOf } from './jira-route';
import { AtlassianSitePolicy, type JiraSitePolicy } from './jira-site-policy';
import { verifyJira } from './jira-verification';

export interface JiraCloudAdapterOptions extends JiraApiClientOptions {
  readonly sitePolicy?: JiraSitePolicy;
  readonly paging?: Partial<JiraPaging>;
  readonly gatewayOrigin?: string;
}

const jiraCredentials = (access: TaskSystemAccess): JiraCredentials => access.credentials;

export class JiraCloudAdapter implements TaskSystemAdapter {
  readonly provider: TaskSystemProvider = 'jira';
  private readonly api: JiraApiClient;
  private readonly sitePolicy: JiraSitePolicy;
  private readonly paging: JiraPaging;
  private readonly gateway: string;

  constructor(options: JiraCloudAdapterOptions = {}) {
    this.api = new JiraApiClient(options);
    this.sitePolicy = options.sitePolicy ?? new AtlassianSitePolicy();
    this.paging = { ...DEFAULT_JIRA_PAGING, ...options.paging };
    this.gateway = options.gatewayOrigin ?? ATLASSIAN_API_GATEWAY;
  }

  async verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    const credentials = jiraCredentials(access);
    const origin = this.sitePolicy.origin(access.siteUrl);
    const { myself, credentials: settled } = await verifyJira(
      this.api,
      origin,
      credentials,
      this.gateway,
    );
    return {
      siteUrl: origin,
      externalAccountId: myself.accountId,
      accountName: myself.displayName ?? myself.emailAddress ?? credentials.email,
      credentials: settled,
    };
  }

  async listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList> {
    const credentials = jiraCredentials(access);
    const origin = this.sitePolicy.origin(access.siteUrl);
    const endpoint = endpointOf(origin, credentials, this.gateway);
    return await listMyOpenIssues(this.api, endpoint, origin, this.paging);
  }
}
