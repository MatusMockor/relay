import type { MailAccount, MailboxId, Message, UserId } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { InviteQueue } from './invite-queue';

export interface HeldInviteReleaseDeps {
  readonly pendingWork: PendingWorkRepository;
  readonly messages: MessageRepository;
  readonly queue: InviteQueue;
}

interface HeldInvite {
  readonly work: PendingWork<'calendar-invite'>;
  readonly message: Message | null;
}

const UNKNOWN = Number.MAX_SAFE_INTEGER;

const arrivalOrder =
  (mailboxOrder: readonly MailboxId[]) =>
  (left: HeldInvite, right: HeldInvite): number =>
    rank(mailboxOrder, left) - rank(mailboxOrder, right) ||
    (left.message?.uid ?? UNKNOWN) - (right.message?.uid ?? UNKNOWN) ||
    left.work.createdAt.localeCompare(right.work.createdAt);

const rank = (mailboxOrder: readonly MailboxId[], invite: HeldInvite): number => {
  const index = invite.message === null ? -1 : mailboxOrder.indexOf(invite.message.mailboxId);
  return index === -1 ? UNKNOWN : index;
};

export class HeldInviteRelease {
  constructor(private readonly deps: HeldInviteReleaseDeps) {}

  async release(
    userId: UserId,
    account: MailAccount,
    mailboxOrder: readonly MailboxId[],
  ): Promise<void> {
    const { pendingWork, messages, queue } = this.deps;
    const work = await pendingWork.list(account.id, 'calendar-invite');
    const held: HeldInvite[] = [];
    for (const item of work.filter((entry) => entry.payload.held === true)) {
      held.push({ work: item, message: await messages.findById(userId, item.payload.messageId) });
    }
    for (const { work: item } of held.sort(arrivalOrder(mailboxOrder))) {
      const { revision: _revision, ...key } = item;
      const { held: _held, ...payload } = item.payload;
      await pendingWork.put({ ...key, payload, createdAt: queue.nextStamp() });
    }
  }
}
