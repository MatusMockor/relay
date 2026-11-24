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
import { LinearApiClient, type LinearApiClientOptions } from './linear-api-client';
import { LinearViewerSchema } from './linear-api-schemas';
import { listMyOpenLinearIssues } from './linear-open-issues';
import { LINEAR_VIEWER_QUERY } from './linear-queries';

export interface LinearAdapterOptions extends LinearApiClientOptions {
  readonly paging?: Partial<TaskPaging>;
}

export class LinearAdapter implements TaskSystemAdapter {
  readonly provider: TaskSystemProvider = 'linear';
  private readonly api: LinearApiClient;
  private readonly paging: TaskPaging;

  constructor(options: LinearAdapterOptions = {}) {
    this.api = new LinearApiClient(options);
    this.paging = { ...DEFAULT_TASK_PAGING, ...options.paging };
  }

  async verify(access: TaskSystemAccess): Promise<TaskSystemAccount> {
    const credentials = credentialsOf(access, 'linear');
    const { viewer, organization } = await this.api.send(
      { credentials, query: LINEAR_VIEWER_QUERY },
      LinearViewerSchema,
    );
    return {
      siteUrl: `https://linear.app/${organization.urlKey.toLowerCase()}`,
      externalAccountId: viewer.id,
      accountName: clipOrNull(viewer.name, 255) ?? clipOrNull(viewer.email, 255) ?? '',
      defaultLabel: clipOrNull(organization.name, 100) ?? 'Linear',
    };
  }

  async listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList> {
    const credentials = credentialsOf(access, 'linear');
    return await listMyOpenLinearIssues(this.api, credentials, this.paging);
  }
}
