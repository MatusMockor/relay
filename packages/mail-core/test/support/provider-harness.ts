import type { GreenMailUser } from '@relay/config/test-infra';
import type { MailProvider } from '@relay/engine';
import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import { ImapFlow } from 'imapflow';
import { DefaultMailProviderFactory, RefreshingOAuthTokenProvider } from '../../src';
import { buildAccount, passwordCredentials } from './accounts';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from './greenmail';
import { FixedClock, InMemoryCredentialVault } from './infrastructure';

export interface ProviderHarness {
  readonly user: GreenMailUser;
  readonly account: MailAccount;
  readonly provider: MailProvider;
  readonly admin: () => Promise<ImapFlow>;
  readonly dispose: () => Promise<void>;
}

export const createTokenProvider = (vault = new InMemoryCredentialVault()) =>
  new RefreshingOAuthTokenProvider({
    refreshers: {},
    vault,
    clock: new FixedClock(new Date('2026-11-15T10:00:00.000Z')),
  });

export const createProvider = (account: MailAccount, credentials: AccountCredentials) =>
  new DefaultMailProviderFactory({
    tokens: createTokenProvider(),
    allowPlaintext: true,
    provider: {
      fetchBatchSize: 2,
      idle: {
        autoIdleDelayMs: 100,
        maxIdleTimeMs: 60_000,
        backoff: { initialMs: 100, maxMs: 1_000 },
      },
    },
  }).create(account, credentials);

export const createProviderHarness = async (): Promise<ProviderHarness> => {
  const user = await createGreenMailUser();
  const account = buildAccount(user);
  const provider = createProvider(account, passwordCredentials(user));
  const admins: ImapFlow[] = [];
  const admin = async () => {
    const client = new ImapFlow({
      ...greenmailImap,
      auth: { user: user.login, pass: user.password },
      logger: false,
    });
    await client.connect();
    admins.push(client);
    return client;
  };
  const dispose = async () => {
    await provider.close();
    await Promise.all(admins.map((client) => client.logout().catch(() => undefined)));
    await deleteGreenMailUser(user);
  };
  return { user, account, provider, admin, dispose };
};
