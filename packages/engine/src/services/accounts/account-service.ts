import type {
  CreateAccountBody,
  TestConnectionBody,
  TestConnectionResponse,
  UpdateAccountBody,
} from '@relay/shared/api';
import type {
  AccountId,
  MailAccount,
  Mailbox,
  OAuthCredentials,
  OAuthProviderKind,
  UserId,
} from '@relay/shared/domain';
import { NotFoundError, NotImplementedError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { CredentialVault } from '../../ports/credential-vault';
import type { Logger } from '../../ports/logger';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { AccountAttachmentRelease } from '../attachments/account-attachment-release';
import type { EngineEvents } from '../shared/engine-events';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { AccountRegistration, AccountPreferences } from './account-registration';
import type { AccountUpdater } from './account-updater';
import type { ConnectionTester } from './connection-tester';
import { oauthProviderSettings } from './oauth-provider-settings';
import type { PrimaryAccountPublisher } from './primary-account-publisher';
import { transientAccount } from './transient-account';

export type CreateImapAccountBody = Extract<CreateAccountBody, { readonly provider: 'imap' }>;

export interface OAuthAccountInput extends AccountPreferences {
  readonly provider: OAuthProviderKind;
  readonly email: string;
  readonly credentials: OAuthCredentials;
  readonly verify?: boolean;
}

export interface AccountServiceDeps {
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly vault: CredentialVault;
  readonly registration: AccountRegistration;
  readonly updater: AccountUpdater;
  readonly primary: PrimaryAccountPublisher;
  readonly tester: ConnectionTester;
  readonly attachments: AccountAttachmentRelease;
  readonly events: EngineEvents;
  readonly readSessions: Pick<LingeringSessions, 'closeAccount'>;
  readonly logger: Logger;
}

export class AccountService {
  constructor(private readonly deps: AccountServiceDeps) {}

  list(userId: UserId): Promise<MailAccount[]> {
    return this.deps.accounts.listByUser(userId);
  }

  async require(userId: UserId, accountId: AccountId): Promise<MailAccount> {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (account === null) {
      throw new NotFoundError('Account', accountId);
    }
    return account;
  }

  async mailboxes(userId: UserId, accountId: AccountId): Promise<Mailbox[]> {
    await this.require(userId, accountId);
    return this.deps.mailboxes.listByAccount(userId, accountId);
  }

  async create(userId: UserId, body: CreateAccountBody): Promise<MailAccount> {
    if (body.provider !== 'imap') {
      throw new NotImplementedError(`Creating ${body.provider} accounts from an OAuth grant`);
    }
    return this.createImap(userId, body);
  }

  createImap(userId: UserId, body: CreateImapAccountBody): Promise<MailAccount> {
    const { password, provider, email, settings, ...preferences } = body;
    return this.register(
      userId,
      {
        ...preferences,
        provider,
        email,
        settings,
        credentials: { kind: 'password', password },
      },
      true,
    );
  }

  createOAuth(userId: UserId, input: OAuthAccountInput): Promise<MailAccount> {
    const { verify, credentials, provider, email, ...preferences } = input;
    return this.register(
      userId,
      {
        ...preferences,
        provider,
        email,
        settings: oauthProviderSettings(provider, email),
        credentials,
      },
      verify ?? false,
    );
  }

  async update(
    userId: UserId,
    accountId: AccountId,
    body: UpdateAccountBody,
  ): Promise<MailAccount> {
    const account = await this.require(userId, accountId);
    const before = await this.deps.accounts.listByUser(userId);
    const updated = await this.deps.updater.update(userId, account, body);
    await this.deps.readSessions.closeAccount(accountId);
    return this.deps.primary.publish(userId, updated, before);
  }

  async remove(userId: UserId, accountId: AccountId): Promise<void> {
    const account = await this.require(userId, accountId);
    const attachments = await this.deps.attachments.attachmentsOf(userId, accountId);
    await this.deps.accounts.delete(userId, accountId);
    await this.deps.readSessions.closeAccount(accountId);
    await this.deps.vault.delete(accountId).catch((error: unknown) => {
      this.deps.logger.warn('Deleting account credentials failed', {
        accountId,
        error: errorMessage(error),
      });
    });
    await this.deps.attachments.release(accountId, attachments);
    await this.deps.events.emit(userId, 'account.removed', { accountId });
    if (account.isPrimary) {
      await this.deps.primary.promoteFirst(userId);
    }
  }

  testConnection(body: TestConnectionBody): Promise<TestConnectionResponse> {
    return this.deps.tester.test(transientAccount(body.settings), {
      kind: 'password',
      password: body.password,
    });
  }

  private async register(
    userId: UserId,
    input: Parameters<AccountRegistration['register']>[1],
    verify: boolean,
  ): Promise<MailAccount> {
    const before = await this.deps.accounts.listByUser(userId);
    const created = await this.deps.registration.register(userId, input, verify);
    return this.deps.primary.publish(userId, created, before);
  }
}
