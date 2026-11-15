import type { AccountId, AccountStatus, MailboxId, UserId } from '@relay/shared/domain';
import type { SyncPhase } from '@relay/shared/realtime';
import type { AccountRepository } from '../../ports/account-repository';
import type { EngineEvents } from '../shared/engine-events';

export interface SyncProgress {
  readonly mailboxId: MailboxId | null;
  readonly phase: SyncPhase;
  readonly processed: number;
  readonly total: number | null;
}

export class SyncReporter {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly events: EngineEvents,
  ) {}

  async status(
    userId: UserId,
    accountId: AccountId,
    status: AccountStatus,
    details: { readonly error: string | null; readonly lastSyncedAt: string | null },
  ): Promise<void> {
    await this.accounts.updateStatus(accountId, {
      status,
      lastError: details.error,
      ...(details.lastSyncedAt === null ? {} : { lastSyncedAt: details.lastSyncedAt }),
    });
    await this.events.emit(userId, 'account.status', {
      accountId,
      status,
      lastSyncedAt: details.lastSyncedAt,
      error: details.error,
    });
  }

  progress(userId: UserId, accountId: AccountId, progress: SyncProgress): Promise<void> {
    return this.events.emit(userId, 'sync.progress', { accountId, ...progress });
  }
}
