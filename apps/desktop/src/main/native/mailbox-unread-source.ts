import type { Repositories } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { UnreadSource } from './unread-badge-updater';

export class MailboxUnreadSource implements UnreadSource {
  constructor(
    private readonly repositories: Pick<Repositories, 'accounts' | 'mailboxes'>,
    private readonly userId: UserId,
  ) {}

  async count(): Promise<number> {
    const accounts = await this.repositories.accounts.listByUser(this.userId);
    const inboxes = await Promise.all(
      accounts.map((account) => this.repositories.mailboxes.findByRole(account.id, 'inbox')),
    );
    return inboxes.reduce((total, inbox) => total + (inbox?.unreadCount ?? 0), 0);
  }
}
