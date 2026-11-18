import type { AccountId, MailAccount } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { errorMessage } from '../shared/mail-provider-sessions';

export interface KeywordPurgerDeps {
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly clock: Clock;
  readonly logger: Logger;
}

type KeywordPurge = PendingWork<'keyword-purge'>;

export class KeywordPurger {
  constructor(private readonly deps: KeywordPurgerDeps) {}

  async purgePending(account: MailAccount, provider: MailProvider): Promise<void> {
    const works = await this.deps.pendingWork.list(account.id, 'keyword-purge');
    for (const work of works.filter((item) => item.payload.purgedAt === undefined)) {
      try {
        await this.purge(provider, work);
        const purgedAt = this.deps.clock.now().toISOString();
        await this.deps.pendingWork.replace(work, { ...work.payload, purgedAt });
      } catch (error) {
        this.deps.logger.warn('Removing a deleted label from the mail server failed', {
          accountId: account.id,
          error: errorMessage(error),
        });
      }
    }
  }

  async expire(accountId: AccountId, syncStartedAt: string): Promise<void> {
    const works = await this.deps.pendingWork.list(accountId, 'keyword-purge');
    await this.deps.pendingWork.remove(
      works.filter(
        ({ payload }) => payload.purgedAt !== undefined && payload.purgedAt < syncStartedAt,
      ),
    );
  }

  private async purge(provider: MailProvider, work: KeywordPurge): Promise<void> {
    for (const mailboxId of work.payload.mailboxIds) {
      const mailbox = await this.deps.mailboxes.findById(mailboxId);
      if (mailbox !== null) {
        await provider.purgeKeyword(mailbox.path, work.payload.keyword);
      }
    }
  }
}
