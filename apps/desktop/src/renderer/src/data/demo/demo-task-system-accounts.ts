import type { ConnectTaskSystemInput, TaskSystemProvider } from '@relay/shared';
import { demoSiteUrl } from './demo-task-system-data';
import { DEMO_NEW_TICKETS, type DemoTicketSeed } from './seed/task-system-tickets';
import { DEMO_GITHUB_TICKETS, DEMO_LINEAR_TICKETS } from './seed/task-system-tickets-more';

export const DEMO_LINEAR_SITE = 'https://linear.app/acme';
export const DEMO_GITHUB_SITE = 'https://github.com';
export const DEMO_ACCOUNT_NAME = 'Ján Novák';

export interface DemoAccount {
  readonly siteUrl: string;
  readonly account: string;
  readonly accountName: string;
  readonly defaultLabel: string;
  readonly tickets: readonly DemoTicketSeed[];
}

type DemoAccountResolvers = {
  readonly [Provider in TaskSystemProvider]: (
    input: Extract<ConnectTaskSystemInput, { provider: Provider }>,
  ) => DemoAccount;
};

const RESOLVERS: DemoAccountResolvers = {
  jira: (input) => {
    const siteUrl = demoSiteUrl(input.siteUrl);
    return {
      siteUrl,
      account: input.email,
      accountName: input.email,
      defaultLabel: new URL(siteUrl).host,
      tickets: DEMO_NEW_TICKETS,
    };
  },
  linear: () => ({
    siteUrl: DEMO_LINEAR_SITE,
    account: 'linear-jan',
    accountName: DEMO_ACCOUNT_NAME,
    defaultLabel: 'Acme',
    tickets: DEMO_LINEAR_TICKETS,
  }),
  github: () => ({
    siteUrl: DEMO_GITHUB_SITE,
    account: 'jnovak',
    accountName: DEMO_ACCOUNT_NAME,
    defaultLabel: 'jnovak',
    tickets: DEMO_GITHUB_TICKETS,
  }),
};

const resolve = <Provider extends TaskSystemProvider>(
  provider: Provider,
  input: Extract<ConnectTaskSystemInput, { provider: Provider }>,
): DemoAccount => RESOLVERS[provider](input);

export const demoAccountOf = (input: ConnectTaskSystemInput): DemoAccount =>
  resolve(input.provider, input);
