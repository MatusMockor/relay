import type { AccountId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { Disposer } from '../../model/remote-mail';
import type { AccountRepository } from '../../ports/account-repository';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import type { AccountSynchronizer, SyncReport } from './account-synchronizer';

export interface SyncServiceDeps {
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly synchronizer: AccountSynchronizer;
  readonly sessions: MailProviderSessions;
  readonly logger: Logger;
}

const DEFAULT_INBOX_PATH = 'INBOX';

export class SyncService {
  private readonly running = new Map<AccountId, Promise<SyncReport>>();
  private readonly queued = new Map<AccountId, Promise<SyncReport>>();

  constructor(private readonly deps: SyncServiceDeps) {}

  syncAccount(userId: UserId, accountId: AccountId): Promise<SyncReport> {
    const queued = this.queued.get(accountId);
    if (queued !== undefined) {
      return queued;
    }
    const running = this.running.get(accountId);
    if (running === undefined) {
      return this.start(userId, accountId);
    }
    const next = running
      .catch(() => undefined)
      .then(() => {
        this.queued.delete(accountId);
        return this.start(userId, accountId);
      });
    this.queued.set(accountId, next);
    return next;
  }

  async syncUser(userId: UserId): Promise<SyncReport[]> {
    const accounts = await this.deps.accounts.listByUser(userId);
    return Promise.all(accounts.map((account) => this.syncAccount(userId, account.id)));
  }

  async syncAllAccounts(): Promise<SyncReport[]> {
    const accounts = await this.deps.accounts.listSyncable();
    const reports: SyncReport[] = [];
    for (const account of accounts) {
      reports.push(await this.syncAccount(account.userId, account.id));
    }
    return reports;
  }

  async watchAccount(userId: UserId, accountId: AccountId): Promise<Disposer> {
    const account = await this.requireAccount(userId, accountId);
    const inbox = await this.deps.mailboxes.findByRole(accountId, 'inbox');
    const provider = await this.deps.sessions.open(account);
    const stop = await this.startIdle(provider, inbox?.path ?? DEFAULT_INBOX_PATH, () => {
      this.syncAccount(userId, accountId).catch((error: unknown) => {
        this.deps.logger.warn('Sync triggered by IDLE failed', {
          accountId,
          error: errorMessage(error),
        });
      });
    });
    return async () => {
      try {
        await stop();
      } finally {
        await provider.close();
      }
    };
  }

  private async startIdle(
    provider: MailProvider,
    path: string,
    onChange: () => void,
  ): Promise<Disposer> {
    try {
      return await provider.idle(path, onChange);
    } catch (error) {
      await provider.close().catch(() => undefined);
      throw error;
    }
  }

  private start(userId: UserId, accountId: AccountId): Promise<SyncReport> {
    const run = this.requireAccount(userId, accountId)
      .then((account) => this.deps.synchronizer.run(userId, account))
      .finally(() => this.running.delete(accountId));
    this.running.set(accountId, run);
    return run;
  }

  private async requireAccount(userId: UserId, accountId: AccountId) {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (account === null) {
      throw new NotFoundError('Account', accountId);
    }
    return account;
  }
}
