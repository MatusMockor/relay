import type { AccountId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { HistorySliceReport } from '../../model/history-backfill';
import type { Disposer } from '../../model/remote-mail';
import type { AccountRepository } from '../../ports/account-repository';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import type { AccountSynchronizer, SyncReport } from './account-synchronizer';
import type { AccountRunQueue } from './account-run-queue';
import type { HistoryBackfill } from './history/history-backfill';

export interface SyncServiceDeps {
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly synchronizer: AccountSynchronizer;
  readonly sessions: MailProviderSessions;
  readonly history: HistoryBackfill | null;
  readonly runs: AccountRunQueue<SyncReport>;
  readonly logger: Logger;
}

const DEFAULT_INBOX_PATH = 'INBOX';

export class SyncService {
  private readonly runs: AccountRunQueue<SyncReport>;

  constructor(private readonly deps: SyncServiceDeps) {
    this.runs = deps.runs;
  }

  syncAccount(userId: UserId, accountId: AccountId): Promise<SyncReport> {
    return this.runs.sync(accountId, () =>
      this.requireAccount(userId, accountId).then((account) =>
        this.deps.synchronizer.run(userId, account),
      ),
    );
  }

  async backfillHistory(userId: UserId, accountId: AccountId): Promise<HistorySliceReport> {
    const { history } = this.deps;
    if (history === null) {
      return { skipped: true, reason: 'unsupported' };
    }
    const run = this.runs.history(accountId, async () => {
      const account = await this.requireAccount(userId, accountId);
      return this.deps.sessions.with(account, (provider) =>
        history.slice(
          { userId, account, provider },
          { shouldYield: () => this.runs.hasPendingWork(accountId) },
        ),
      );
    });
    return (await run) ?? { skipped: true, reason: 'busy' };
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

  private async requireAccount(userId: UserId, accountId: AccountId) {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (account === null) {
      throw new NotFoundError('Account', accountId);
    }
    return account;
  }
}
