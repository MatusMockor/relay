import type { MailProvider, MailProviderFactory } from '@relay/engine';
import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { ConnectionOptions } from 'node:tls';
import { CredentialsMailAuthResolver } from '../auth/credentials-mail-auth-resolver';
import type { OAuthTokenProvider } from '../auth/oauth-token-provider';
import { ImapClientFactory, type ImapTimeouts } from '../imap/imap-client-factory';
import { ImapMailProvider, type ImapMailProviderOptions } from '../imap/imap-mail-provider';

export interface DefaultMailProviderFactoryOptions {
  readonly tokens: OAuthTokenProvider;
  readonly timeouts?: ImapTimeouts;
  readonly tls?: ConnectionOptions;
  readonly allowPlaintext?: boolean;
  readonly provider?: ImapMailProviderOptions;
}

export class DefaultMailProviderFactory implements MailProviderFactory {
  constructor(private readonly options: DefaultMailProviderFactoryOptions) {}

  create(account: MailAccount, credentials: AccountCredentials): MailProvider {
    const clients = new ImapClientFactory({
      endpoint: account.settings.imap,
      auth: new CredentialsMailAuthResolver(account, credentials, this.options.tokens),
      timeouts: this.options.timeouts,
      tls: this.options.tls,
      allowPlaintext: this.options.allowPlaintext,
    });
    return new ImapMailProvider(clients, this.options.provider);
  }
}
