import type {
  FailedInvitation,
  FailedInvitationRef,
  FailedInvitationRetry,
  MailAccount,
  UserId,
} from '@relay/shared/domain';
import { ConflictError, NotFoundError } from '../../errors';
import type { PendingWork } from '../../model/pending-work';
import type { AccountRepository } from '../../ports/account-repository';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { CalendarPartsSink } from '../sync/calendar-parts-sink';
import { toFailedInvitation } from './failed-invitation-view';
import { retryNow } from './invite-retry';

export interface FailedInvitationServiceDeps {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly invites: Pick<CalendarPartsSink, 'flush'>;
}

interface FailedWork {
  readonly account: MailAccount;
  readonly work: PendingWork<'calendar-invite'>;
}

export class FailedInvitationService {
  constructor(private readonly deps: FailedInvitationServiceDeps) {}

  async list(userId: UserId): Promise<FailedInvitation[]> {
    const accounts = await this.deps.accounts.listByUser(userId);
    const lists = await Promise.all(accounts.map((account) => this.failedOf(userId, account)));
    return lists.flat().sort((a, b) => b.failedAt.localeCompare(a.failedAt));
  }

  async retry(userId: UserId, ref: FailedInvitationRef): Promise<FailedInvitationRetry> {
    const { account, work } = await this.require(userId, ref);
    const queued = await this.deps.pendingWork.replace(work, retryNow(work.payload));
    if (queued === null) {
      throw new ConflictError('The invitation changed while it was being retried');
    }
    await this.deps.invites.flush(userId, account);
    return { applied: (await this.deps.pendingWork.find(queued)) === null };
  }

  async dismiss(userId: UserId, ref: FailedInvitationRef): Promise<void> {
    const { work } = await this.require(userId, ref);
    await this.deps.pendingWork.remove([work]);
  }

  private async failedOf(userId: UserId, account: MailAccount): Promise<FailedInvitation[]> {
    const work = await this.deps.pendingWork.list(account.id, 'calendar-invite');
    const failed = work.flatMap((item) => {
      const failedAt = item.payload.failedAt;
      return failedAt === null ? [] : [{ item, failedAt }];
    });
    return Promise.all(
      failed.map(async ({ item, failedAt }) => {
        const message = await this.deps.messages.findById(userId, item.payload.messageId);
        return toFailedInvitation(account, item, failedAt, message);
      }),
    );
  }

  private async require(userId: UserId, ref: FailedInvitationRef): Promise<FailedWork> {
    const account = await this.deps.accounts.findById(userId, ref.accountId);
    if (account === null) {
      throw new NotFoundError('Account', ref.accountId);
    }
    const work = await this.deps.pendingWork.find({
      accountId: account.id,
      kind: 'calendar-invite',
      ref: ref.messageId,
    });
    if (work === null || work.payload.failedAt === null) {
      throw new NotFoundError('Failed invitation', ref.messageId);
    }
    return { account, work };
  }
}
