import type { MailAccount } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { errorMessage } from '../shared/mail-provider-sessions';

export interface KeywordPurgerDeps {
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly logger: Logger;
}

export class KeywordPurger {
  constructor(private readonly deps: KeywordPurgerDeps) {}

  async purgePending(account: MailAccount, provider: MailProvider): Promise<void> {
    const works = await this.deps.pendingWork.list(account.id, 'keyword-purge');
    for (const work of works) {
      try {
        await this.purge(provider, work);
        await this.deps.pendingWork.remove([work]);
      } catch (error) {
        this.deps.logger.warn('Removing a deleted label from the mail server failed', {
          accountId: account.id,
          error: errorMessage(error),
        });
      }
    }
  }

  private async purge(provider: MailProvider, work: PendingWork<'keyword-purge'>): Promise<void> {
    for (const mailboxId of work.payload.mailboxIds) {
      const mailbox = await this.deps.mailboxes.findById(mailboxId);
      if (mailbox !== null) {
        await provider.purgeKeyword(mailbox.path, work.payload.keyword);
      }
    }
  }
}
