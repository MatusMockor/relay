import type { ConnectTaskSystemInput, JiraConnectInput } from '@relay/shared/domain';
import type { TaskSystemAccess } from '../../model/task-system';

export interface ConnectRequest {
  readonly access: TaskSystemAccess;
  readonly label: string | null;
}

const jiraRequest = (input: JiraConnectInput): ConnectRequest => ({
  access: {
    siteUrl: input.siteUrl,
    credentials: { provider: 'jira', email: input.email, apiToken: input.apiToken },
  },
  label: input.label ?? null,
});

type ConnectRequestBuilders = {
  readonly [Provider in ConnectTaskSystemInput['provider']]: (
    input: Extract<ConnectTaskSystemInput, { provider: Provider }>,
  ) => ConnectRequest;
};

const BUILDERS: ConnectRequestBuilders = { jira: jiraRequest };

export const connectRequestOf = (input: ConnectTaskSystemInput): ConnectRequest =>
  BUILDERS[input.provider](input);

export const defaultLabelOf = (siteUrl: string): string => new URL(siteUrl).hostname.slice(0, 100);
