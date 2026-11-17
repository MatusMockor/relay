import type { Mailbox } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { InviteCandidate } from '../../ports/invite-candidate-repository';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { Repositories } from '../../ports/repositories';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { SyncBackfill } from '../sync/sync-backfill';
import type { SyncContext } from '../sync/sync-context';
import { acceptsInvites, type InviteQueue } from './invite-queue';

export const DEFAULT_INVITE_BACKFILL_BATCH = 50;

export interface InviteBackfillDeps {
  readonly repositories: Pick<Repositories, 'inviteCandidates' | 'pendingWork'>;
  readonly unitOfWork: UnitOfWork;
  readonly queue: InviteQueue;
  readonly logger: Logger;
  readonly batchSize: number;
}

type BackfillWork = PendingWork<'calendar-backfill'>;

export class InviteBackfill implements SyncBackfill {
  constructor(private readonly deps: InviteBackfillDeps) {}

  async run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void> {
    const { pendingWork } = this.deps.repositories;
    let budget = this.deps.batchSize;
    try {
      for (const work of await pendingWork.list(context.account.id, 'calendar-backfill')) {
        if (budget <= 0) {
          return;
        }
        const mailbox = mailboxes.find((entry) => entry.id === work.payload.mailboxId);
        if (mailbox === undefined || !acceptsInvites(mailbox.role)) {
          await pendingWork.remove([work]);
          continue;
        }
        budget -= await this.mailbox(context, mailbox, work, budget);
      }
    } catch (error) {
      this.deps.logger.warn('Calendar invitation back-fill paused', {
        accountId: context.account.id,
        error: errorMessage(error),
      });
    }
  }

  private async mailbox(
    context: SyncContext,
    mailbox: Mailbox,
    work: BackfillWork,
    budget: number,
  ): Promise<number> {
    const candidates = await this.deps.repositories.inviteCandidates.listAfter(
      mailbox.id,
      work.payload.afterUid,
      budget,
    );
    let cursor = work;
    for (const candidate of candidates) {
      const parts = await this.partsOf(context.provider, mailbox, candidate);
      cursor = await this.deps.unitOfWork.run(async (repositories) => {
        await this.deps.queue.queue(repositories.pendingWork, {
          account: context.account,
          mailboxRole: mailbox.role,
          messageId: candidate.messageId,
          threadId: candidate.threadId,
          parts,
          publish: true,
          hold: false,
        });
        const { revision: _revision, ...key } = cursor;
        return repositories.pendingWork.put({
          ...key,
          payload: { mailboxId: mailbox.id, afterUid: candidate.uid },
        });
      });
    }
    if (candidates.length < budget) {
      await this.deps.repositories.pendingWork.remove([cursor]);
    }
    return candidates.length;
  }

  private async partsOf(
    provider: MailProvider,
    mailbox: Mailbox,
    candidate: InviteCandidate,
  ): Promise<readonly string[]> {
    return (await provider.fetchCalendarParts(mailbox.path, candidate.uid)) ?? [];
  }
}
