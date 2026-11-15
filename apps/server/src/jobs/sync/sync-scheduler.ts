import { Inject, Injectable } from '@nestjs/common';
import { type AccountRepository, type Clock, PORT_TOKENS } from '@relay/engine';
import type { AccountId, MailAccount } from '@relay/shared/domain';
import { SyncTrigger } from './sync-trigger';

@Injectable()
export class SyncScheduler {
  private readonly requestedAt = new Map<AccountId, number>();

  constructor(
    @Inject(PORT_TOKENS.AccountRepository) private readonly accounts: AccountRepository,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
    private readonly trigger: SyncTrigger,
  ) {}

  async tick(): Promise<void> {
    const now = this.clock.now().getTime();
    const accounts = await this.accounts.listSyncable();
    const due = accounts.filter((account) => this.isDue(account, now));
    await Promise.all(due.map((account) => this.request(account, now)));
  }

  private async request(account: MailAccount, now: number): Promise<void> {
    this.requestedAt.set(account.id, now);
    try {
      await this.trigger.request(account.userId, account.id);
    } catch (error) {
      if (this.requestedAt.get(account.id) === now) {
        this.requestedAt.delete(account.id);
      }
      throw error;
    }
  }

  private isDue(account: MailAccount, now: number): boolean {
    const intervalMs = account.syncIntervalSeconds * 1000;
    const lastRequested = this.requestedAt.get(account.id) ?? 0;
    if (now - lastRequested < intervalMs) {
      return false;
    }
    if (account.lastSyncedAt === null) {
      return true;
    }
    return now - Date.parse(account.lastSyncedAt) >= intervalMs;
  }
}
