import { type MailAccount, oldestAccount, type UserId } from '@relay/shared/domain';
import type { AccountRepository } from '../../ports/account-repository';
import type { EngineEvents } from '../shared/engine-events';

export class PrimaryAccountPublisher {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly events: EngineEvents,
  ) {}

  async publish(
    userId: UserId,
    changed: MailAccount,
    before: readonly MailAccount[],
  ): Promise<MailAccount> {
    if (changed.isPrimary) {
      await this.accounts.setPrimary(userId, changed.id);
    }
    const after = await this.accounts.listByUser(userId);
    const previous = new Map(before.map((account) => [account.id, account]));
    for (const account of after) {
      const old = previous.get(account.id);
      if (account.id === changed.id || old?.isPrimary !== account.isPrimary) {
        await this.events.emit(userId, 'account.upserted', { account });
      }
    }
    return after.find((account) => account.id === changed.id) ?? changed;
  }

  async promoteFirst(userId: UserId): Promise<void> {
    const remaining = await this.accounts.listByUser(userId);
    const next = oldestAccount(remaining);
    if (next === undefined || remaining.some((account) => account.isPrimary)) {
      return;
    }
    await this.accounts.setPrimary(userId, next.id);
    const promoted = await this.accounts.findById(userId, next.id);
    if (promoted !== null) {
      await this.events.emit(userId, 'account.upserted', { account: promoted });
    }
  }
}
