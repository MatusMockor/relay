import type {
  AccountCredentials,
  ImapSmtpSettings,
  MailAccount,
  MailProviderKind,
  UserId,
} from '@relay/shared/domain';
import { ConflictError, ProviderError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { Clock } from '../../ports/clock';
import type { CredentialVault } from '../../ports/credential-vault';
import type { IdGenerator } from '../../ports/id-generator';
import { accountColor, DEFAULT_SYNC_INTERVAL_SECONDS } from './account-defaults';
import { type ConnectionTester, describeFailure } from './connection-tester';

export interface AccountPreferences {
  readonly displayName?: string;
  readonly color?: string;
  readonly isPrimary?: boolean;
  readonly syncIntervalSeconds?: number;
}

export interface NewAccountInput extends AccountPreferences {
  readonly provider: MailProviderKind;
  readonly email: string;
  readonly settings: ImapSmtpSettings;
  readonly credentials: AccountCredentials;
}

export interface AccountRegistrationDeps {
  readonly accounts: AccountRepository;
  readonly vault: CredentialVault;
  readonly tester: ConnectionTester;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class AccountRegistration {
  constructor(private readonly deps: AccountRegistrationDeps) {}

  async register(userId: UserId, input: NewAccountInput, verify: boolean): Promise<MailAccount> {
    if ((await this.deps.accounts.findByEmail(userId, input.email)) !== null) {
      throw new ConflictError(`Account ${input.email} already exists`);
    }
    const existing = await this.deps.accounts.listByUser(userId);
    const account: MailAccount = {
      id: this.deps.ids.generate('account'),
      userId,
      provider: input.provider,
      displayName: input.displayName ?? input.email,
      email: input.email,
      color: input.color ?? accountColor(existing.length),
      isPrimary: input.isPrimary ?? existing.length === 0,
      syncIntervalSeconds: input.syncIntervalSeconds ?? DEFAULT_SYNC_INTERVAL_SECONDS,
      settings: input.settings,
      status: 'connected',
      lastError: null,
      lastSyncedAt: null,
      createdAt: this.deps.clock.now().toISOString(),
    };
    if (verify) {
      const failure = describeFailure(await this.deps.tester.test(account, input.credentials));
      if (failure !== null) {
        throw new ProviderError(`Could not connect to ${input.email}: ${failure}`);
      }
    }
    const created = await this.deps.accounts.create(account);
    try {
      await this.deps.vault.set(created.id, input.credentials);
    } catch (error) {
      await this.rollback(userId, created, existing);
      throw error;
    }
    return created;
  }

  private async rollback(
    userId: UserId,
    created: MailAccount,
    existing: readonly MailAccount[],
  ): Promise<void> {
    await this.deps.accounts.delete(userId, created.id);
    const previous = existing.find((candidate) => candidate.isPrimary);
    if (!created.isPrimary || previous === undefined) {
      return;
    }
    const remaining = await this.deps.accounts.listByUser(userId);
    if (
      remaining.some((account) => account.isPrimary) ||
      !remaining.some((account) => account.id === previous.id)
    ) {
      return;
    }
    await this.deps.accounts.setPrimary(userId, previous.id);
  }
}
