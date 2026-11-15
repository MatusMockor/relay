import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { MailAuth, MailAuthResolver } from './mail-auth';
import type { OAuthTokenProvider } from './oauth-token-provider';

export class CredentialsMailAuthResolver implements MailAuthResolver {
  constructor(
    private readonly account: MailAccount,
    private readonly credentials: AccountCredentials,
    private readonly tokens: OAuthTokenProvider,
  ) {}

  async resolve(): Promise<MailAuth> {
    const user = this.account.settings.username;
    if (this.credentials.kind === 'password') {
      return { kind: 'password', user, password: this.credentials.password };
    }
    const accessToken = await this.tokens.getAccessToken(this.account, this.credentials);
    return { kind: 'oauth2', user, accessToken };
  }
}
