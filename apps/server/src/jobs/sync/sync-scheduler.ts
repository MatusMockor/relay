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
    await Promise.all(
      due.map(async (account) => {
        this.requestedAt.set(account.id, now);
        await this.trigger.request(account.userId, account.id);
      }),
    );
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
