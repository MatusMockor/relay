import type { UpdateAccountBody } from '@relay/shared/api';
import type { AccountCredentials, MailAccount, UserId } from '@relay/shared/domain';
import { NotFoundError, ProviderError, ValidationError } from '../../errors';
import type { AccountChanges, AccountRepository } from '../../ports/account-repository';
import type { ConditionalCredentialVault } from '../../ports/credential-vault';
import { type ConnectionTester, describeFailure } from './connection-tester';

export class AccountUpdater {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly vault: ConditionalCredentialVault,
    private readonly tester: ConnectionTester,
  ) {}

  async update(
    userId: UserId,
    account: MailAccount,
    body: UpdateAccountBody,
  ): Promise<MailAccount> {
    const credentials = await this.credentials(account, body);
    if (credentials !== null) {
      await this.verify({ ...account, settings: body.settings ?? account.settings }, credentials);
    }
    const { password: _password, ...changes } = body;
    const previous = body.password === undefined ? null : await this.vault.get(account.id);
    if (body.password !== undefined && credentials !== null) {
      await this.vault.set(account.id, credentials);
    }
    const updated = await this.accounts
      .update(userId, account.id, changes satisfies AccountChanges)
      .catch(async (error: unknown) => {
        if (previous !== null && credentials !== null) {
          await this.vault.setIfUnchanged(account.id, credentials, previous);
        }
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      });
    if (updated === null) {
      throw new NotFoundError('Account', account.id);
    }
    return updated;
  }

  private async credentials(
    account: MailAccount,
    body: UpdateAccountBody,
  ): Promise<AccountCredentials | null> {
    if (body.password === undefined && body.settings === undefined) {
      return null;
    }
    if (body.password !== undefined) {
      if (account.provider !== 'imap') {
        throw new ValidationError('Only IMAP accounts use a password');
      }
      return { kind: 'password', password: body.password };
    }
    const stored = await this.vault.get(account.id);
    if (stored === null) {
      throw new ProviderError(`No credentials stored for account ${account.email}`);
    }
    return stored;
  }

  private async verify(account: MailAccount, credentials: AccountCredentials): Promise<void> {
    const failure = describeFailure(await this.tester.test(account, credentials));
    if (failure !== null) {
      throw new ProviderError(`Could not connect to ${account.email}: ${failure}`);
    }
  }
}
