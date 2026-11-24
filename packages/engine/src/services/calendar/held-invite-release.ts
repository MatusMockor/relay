import type {
  MailAccount,
  MailboxId,
  Message,
  MessagePlacement,
  UserId,
} from '@relay/shared/domain';
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

interface HeldPosition {
  readonly index: number;
  readonly uid: number;
}

interface PositionedInvite {
  readonly work: PendingWork<'calendar-invite'>;
  readonly position: HeldPosition;
}

const UNKNOWN = Number.MAX_SAFE_INTEGER;

const NOWHERE: HeldPosition = { index: UNKNOWN, uid: UNKNOWN };

const positionIn = (
  mailboxOrder: readonly MailboxId[],
  placement: MessagePlacement,
): HeldPosition => {
  const index = mailboxOrder.indexOf(placement.mailboxId);
  return { index: index === -1 ? UNKNOWN : index, uid: placement.uid };
};

const earlier = (left: HeldPosition, right: HeldPosition): number =>
  left.index - right.index || left.uid - right.uid;

const bestHeldPlacement = (message: Message, mailboxOrder: readonly MailboxId[]): HeldPosition =>
  message.placements
    .map((placement) => positionIn(mailboxOrder, placement))
    .reduce((best, next) => (earlier(next, best) < 0 ? next : best), NOWHERE);

const arrivalOrder = (left: PositionedInvite, right: PositionedInvite): number =>
  earlier(left.position, right.position) || left.work.createdAt.localeCompare(right.work.createdAt);

export class HeldInviteRelease {
  constructor(private readonly deps: HeldInviteReleaseDeps) {}

  async hasHeld(account: MailAccount): Promise<boolean> {
    const work = await this.deps.pendingWork.list(account.id, 'calendar-invite');
    return work.some((item) => item.payload.held === true);
  }

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
    const orphaned = held.filter((invite) => invite.message === null).map(({ work }) => work);
    if (orphaned.length > 0) {
      await pendingWork.remove(orphaned);
    }
    const located = held.flatMap(({ work: item, message }) =>
      message === null ? [] : [{ work: item, position: bestHeldPlacement(message, mailboxOrder) }],
    );
    for (const { work: item } of located.sort(arrivalOrder)) {
      const { revision: _revision, ...key } = item;
      const { held: _held, ...payload } = item.payload;
      await pendingWork.put({ ...key, payload, createdAt: queue.nextStamp() });
    }
  }
}
