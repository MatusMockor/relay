import type { OfflineStats, UserId } from '@relay/shared/domain';
import type { AccountRepository } from '../../ports/account-repository';
import type { MessageBodyStore } from '../../ports/message-body-store';

export class OfflineStatsReader {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly store: MessageBodyStore | null,
  ) {}

  async forUser(userId: UserId): Promise<OfflineStats> {
    const { store } = this;
    if (store === null) {
      return { local: 0, remote: 0 };
    }
    const accounts = await this.accounts.listByUser(userId);
    const stats = await Promise.all(accounts.map((account) => store.stats(account.id)));
    return stats.reduce(
      (total, next) => ({ local: total.local + next.local, remote: total.remote + next.remote }),
      { local: 0, remote: 0 },
    );
  }
}
