import type {
  ConnectTaskSystemInput,
  GitHubConnectInput,
  JiraConnectInput,
  LinearConnectInput,
} from '@relay/shared/domain';
import type { TaskSystemAccess, TaskSystemAccount } from '../../model/task-system';

export interface ConnectRequest {
  readonly access: TaskSystemAccess;
  readonly label: string | null;
}

export const LINEAR_SITE_URL = 'https://linear.app';
export const GITHUB_SITE_URL = 'https://github.com';

const jiraRequest = (input: JiraConnectInput): ConnectRequest => ({
  access: {
    siteUrl: input.siteUrl,
    credentials: { provider: 'jira', email: input.email, apiToken: input.apiToken },
  },
  label: input.label ?? null,
});

const linearRequest = (input: LinearConnectInput): ConnectRequest => ({
  access: { siteUrl: LINEAR_SITE_URL, credentials: { provider: 'linear', apiKey: input.apiKey } },
  label: input.label ?? null,
});

const githubRequest = (input: GitHubConnectInput): ConnectRequest => ({
  access: { siteUrl: GITHUB_SITE_URL, credentials: { provider: 'github', token: input.token } },
  label: input.label ?? null,
});

export const connectRequestOf = (input: ConnectTaskSystemInput): ConnectRequest => {
  switch (input.provider) {
    case 'jira':
      return jiraRequest(input);
    case 'linear':
      return linearRequest(input);
    case 'github':
      return githubRequest(input);
  }
};

export const defaultLabelOf = (account: TaskSystemAccount): string => {
  const label = account.defaultLabel.trim();
  return (label === '' ? new URL(account.siteUrl).hostname : label).slice(0, 100);
};
