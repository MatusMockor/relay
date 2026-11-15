import type { GreenMailUser } from '@relay/config/test-infra';
import { api, type ThreadPage } from '@relay/shared/api';
import type { AccountId, MailAccount, ThreadSummary } from '@relay/shared/domain';
import { expect } from 'vitest';
import type { ApiClient } from './api-client';
import { greenMailSettings } from './greenmail';

export const addImapAccount = (
  client: ApiClient,
  accessToken: string,
  user: GreenMailUser,
  displayName = 'Work',
): Promise<MailAccount> =>
  client.ok(
    api.accounts.create,
    {
      body: {
        provider: 'imap',
        email: user.email,
        displayName,
        settings: greenMailSettings(user),
        password: user.password,
      },
    },
    accessToken,
  );

export const listInbox = (
  client: ApiClient,
  accessToken: string,
  accountId?: AccountId,
): Promise<ThreadPage> =>
  client.ok(
    api.threads.list,
    { query: accountId === undefined ? { view: 'inbox' } : { view: 'inbox', accountId } },
    accessToken,
  );

export const waitForInbox = async (
  client: ApiClient,
  accessToken: string,
  predicate: (threads: ThreadSummary[]) => boolean,
  accountId?: AccountId,
): Promise<ThreadSummary[]> => {
  let latest: ThreadSummary[] = [];
  await expect
    .poll(
      async () => {
        latest = (await listInbox(client, accessToken, accountId)).items;
        return predicate(latest);
      },
      { timeout: 20_000, interval: 250 },
    )
    .toBe(true);
  return latest;
};
