import type {
  ConnectTaskSystemInput,
  GitHubConnectInput,
  JiraConnectInput,
  LinearConnectInput,
  TaskSystemProvider,
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

type ConnectInputOf = {
  readonly [Provider in TaskSystemProvider]: Extract<
    ConnectTaskSystemInput,
    { provider: Provider }
  >;
};

type ConnectRequestBuilders = {
  readonly [Provider in TaskSystemProvider]: (input: ConnectInputOf[Provider]) => ConnectRequest;
};

const BUILDERS: ConnectRequestBuilders = {
  jira: jiraRequest,
  linear: linearRequest,
  github: githubRequest,
};

const build = <Provider extends TaskSystemProvider>(
  provider: Provider,
  input: ConnectInputOf[Provider],
): ConnectRequest => BUILDERS[provider](input);

export const connectRequestOf = (input: ConnectTaskSystemInput): ConnectRequest =>
  build(input.provider, input);

export const defaultLabelOf = (account: TaskSystemAccount): string => {
  const label = account.defaultLabel.trim();
  return (label === '' ? new URL(account.siteUrl).hostname : label).slice(0, 100);
};
