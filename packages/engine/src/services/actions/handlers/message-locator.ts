import type { MailboxId, MailboxRole } from '@relay/shared/domain';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import { type MoveOrigin, moveOrigins } from '../../shared/move-origins';
import { pendingMoveTargets } from '../../shared/provider-ops';
import type { ThreadActionContext } from '../thread-action-context';
import type { LocatedMessage } from './state-move-plan';

type LiveMailboxes = ReadonlyMap<MailboxId, MailboxRole>;

const liveOrigin = (origin: MoveOrigin | undefined, mailboxes: LiveMailboxes) =>
  origin?.mailboxId === undefined || mailboxes.has(origin.mailboxId) ? origin : undefined;

const liveMoveOrigin = (origin: MoveOrigin | undefined, mailboxes: LiveMailboxes) => {
  if (origin === undefined || liveOrigin(origin, mailboxes) !== undefined) {
    return origin;
  }
  return origin.labelId === undefined
    ? { role: 'inbox' as const }
    : { role: 'inbox' as const, labelId: origin.labelId };
};

export class MessageLocator {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly pendingWork: PendingWorkRepository,
  ) {}

  async locate(context: ThreadActionContext): Promise<LocatedMessage[]> {
    const accountId = context.account.id;
    const { pendingWork } = this;
    const mailboxes = await this.mailboxes.listForSync(accountId);
    const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
    const pending = await pendingMoveTargets(pendingWork, accountId);
    const trashed = await moveOrigins(pendingWork, accountId, 'trash-origin');
    const reported = await moveOrigins(pendingWork, accountId, 'spam-origin');
    const moved = await moveOrigins(pendingWork, accountId, 'move-origin');
    return context.messages.map((message) => {
      const target = pending.get(message.id);
      const role = target?.role ?? roles.get(message.mailboxId);
      const mailboxId = target === undefined ? message.mailboxId : target.mailboxId;
      const origins = role === 'spam' ? reported : trashed;
      return {
        message,
        role,
        mailboxId,
        origin: liveOrigin(origins.get(message.id), roles),
        moveOrigin: liveMoveOrigin(moved.get(message.id), roles),
        moving: pending.has(message.id),
      };
    });
  }
}
