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
import type { EngineEvents } from '../shared/engine-events';
import type { CalendarPartsSink } from '../sync/calendar-parts-sink';
import { toFailedInvitation } from './failed-invitation-view';
import { retryNow } from './invite-retry';

export interface FailedInvitationServiceDeps {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly invites: Pick<CalendarPartsSink, 'flush'>;
  readonly events: EngineEvents;
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
    const applied = (await this.deps.pendingWork.find(queued)) === null;
    await this.changed(userId, account);
    return { applied };
  }

  async dismiss(userId: UserId, ref: FailedInvitationRef): Promise<void> {
    const { account, work } = await this.require(userId, ref);
    if ((await this.deps.pendingWork.remove([work])) === 0) {
      throw new ConflictError('The invitation changed while it was being dismissed');
    }
    await this.changed(userId, account);
  }

  private changed(userId: UserId, account: MailAccount): Promise<void> {
    return this.deps.events.emit(userId, 'calendar.updated', {
      sourceKind: 'invite',
      sourceId: account.id,
    });
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
