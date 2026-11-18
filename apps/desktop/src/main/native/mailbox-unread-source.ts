import type { Repositories } from '@relay/engine';
import type { MailAccount, UserId } from '@relay/shared/domain';
import type { AccountOverview } from './account-overview';
import type { AccountOverviewSource } from './account-overview-updater';

export class MailboxUnreadSource implements AccountOverviewSource {
  constructor(
    private readonly repositories: Pick<Repositories, 'accounts' | 'mailboxes'>,
    private readonly userId: UserId,
  ) {}

  async load(): Promise<AccountOverview[]> {
    const accounts = await this.repositories.accounts.listByUser(this.userId);
    return Promise.all(accounts.map((account) => this.overviewOf(account)));
  }

  private async overviewOf(account: MailAccount): Promise<AccountOverview> {
    const inbox = await this.repositories.mailboxes.findByRole(account.id, 'inbox');
    return {
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      color: account.color,
      status: account.status,
      lastSyncedAt: account.lastSyncedAt,
      unread: inbox?.unreadCount ?? 0,
    };
  }
}
