import type { MailAccount } from '@relay/shared/domain';
import { ProviderError } from '../../errors';
import type { CredentialVault } from '../../ports/credential-vault';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailProviderFactory } from '../../ports/mail-provider-factory';

export class MailProviderSessions {
  constructor(
    private readonly factory: MailProviderFactory,
    private readonly vault: CredentialVault,
  ) {}

  async open(account: MailAccount): Promise<MailProvider> {
    const credentials = await this.vault.get(account.id);
    if (credentials === null) {
      throw new ProviderError(`No credentials stored for account ${account.email}`);
    }
    try {
      const provider = this.factory.create(account, credentials);
      await provider.connect();
      return provider;
    } catch (error) {
      throw new ProviderError(`Could not connect to ${account.email}: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  async with<Result>(
    account: MailAccount,
    work: (provider: MailProvider) => Promise<Result>,
  ): Promise<Result> {
    const provider = await this.open(account);
    try {
      return await work(provider);
    } finally {
      await provider.close().catch(() => undefined);
    }
  }
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
