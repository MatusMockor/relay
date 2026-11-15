import { Inject, Injectable } from '@nestjs/common';
import { AccountService, NotImplementedError, ValidationError } from '@relay/engine';
import type { CreateAccountBody } from '@relay/shared/api';
import { EmailAddressSchema, type MailAccount, type UserId } from '@relay/shared/domain';
import { SyncTrigger } from '../jobs/sync/sync-trigger';
import { OAUTH_CODE_EXCHANGER, type OAuthCodeExchanger } from '../mail/oauth-code-exchanger';

type GmailBody = Extract<CreateAccountBody, { provider: 'gmail' }>;

@Injectable()
export class AccountCreationService {
  constructor(
    private readonly accounts: AccountService,
    private readonly sync: SyncTrigger,
    @Inject(OAUTH_CODE_EXCHANGER) private readonly oauth: OAuthCodeExchanger,
  ) {}

  async create(userId: UserId, body: CreateAccountBody): Promise<MailAccount> {
    const account = await this.register(userId, body);
    await this.sync.request(userId, account.id);
    return account;
  }

  private register(userId: UserId, body: CreateAccountBody): Promise<MailAccount> {
    if (body.provider === 'imap') {
      return this.accounts.createImap(userId, body);
    }
    if (body.provider === 'gmail') {
      return this.registerGmail(userId, body);
    }
    throw new NotImplementedError('Outlook accounts');
  }

  private async registerGmail(userId: UserId, body: GmailBody): Promise<MailAccount> {
    const { oauth, provider, ...preferences } = body;
    const exchanged = await this.oauth.exchangeGoogle(oauth);
    const email = EmailAddressSchema.safeParse(exchanged.email);
    if (!email.success) {
      throw new ValidationError('Google did not return the account email address');
    }
    return this.accounts.createOAuth(userId, {
      ...preferences,
      provider,
      email: email.data.toLowerCase(),
      credentials: exchanged.credentials,
      verify: false,
    });
  }
}
