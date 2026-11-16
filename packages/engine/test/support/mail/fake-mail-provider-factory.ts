import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { MailProvider, MailProviderFactory } from '../../../src';
import { FakeMailProvider } from './fake-mail-provider';
import type { FakeMailServer } from './fake-mail-server';

export class FakeMailProviderFactory implements MailProviderFactory {
  readonly servers = new Map<string, FakeMailServer>();

  register(email: string, server: FakeMailServer): FakeMailServer {
    this.servers.set(email.toLowerCase(), server);
    return server;
  }

  create(account: MailAccount, credentials: AccountCredentials): MailProvider {
    return new FakeMailProvider(this.servers.get(account.email.toLowerCase()) ?? null, credentials);
  }
}
