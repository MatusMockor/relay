import type { AccountId, Mailbox, MailAccount, Message } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { labelsMessages } from '../shared/mail-copies';
import type { MoveOriginKind } from '../shared/move-origins';
import { PENDING_UID } from '../shared/pending-uid';
import { SyncJournal } from '../sync/sync-journal';

export interface MovedCopyMergerDeps {
  readonly messages: MessageRepository;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
}

const ORIGIN_KINDS: readonly MoveOriginKind[] = ['trash-origin', 'spam-origin', 'move-origin'];

const transferOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  moving: Message,
  twin: Message,
): Promise<void> => {
  for (const kind of ORIGIN_KINDS) {
    const moved = await pendingWork.find({ accountId, kind, ref: moving.id });
    if (moved === null) {
      continue;
    }
    const kept = await pendingWork.find({ accountId, kind, ref: twin.id });
    await pendingWork.put({
      accountId,
      kind,
      ref: twin.id,
      payload: { ...kept?.payload, ...moved.payload, messageId: twin.id },
      createdAt: moved.createdAt,
    });
    await pendingWork.remove([moved]);
  }
};

export class MovedCopyMerger {
  constructor(private readonly deps: MovedCopyMergerDeps) {}

  async twinOf(
    account: MailAccount,
    moving: Message,
    target: Mailbox,
    uid: number,
  ): Promise<Message | null> {
    if (uid !== PENDING_UID) {
      const located = await this.deps.messages.findByLocation({ mailboxId: target.id, uid });
      return located === null || located.id === moving.id ? null : located;
    }
    if (moving.emailId === null || !labelsMessages(account)) {
      return null;
    }
    const copies = await this.deps.messages.findByEmailId(moving.accountId, moving.emailId);
    return copies.find((copy) => copy.mailboxId === target.id && copy.id !== moving.id) ?? null;
  }

  async merge(account: MailAccount, moving: Message, twin: Message): Promise<void> {
    const journal = new SyncJournal(account.id, this.deps.clock);
    await this.deps.unitOfWork.run(async (repositories) => {
      await transferOrigins(repositories.pendingWork, account.id, moving, twin);
      await repositories.drafts.retargetReplies(moving.id, twin.id);
      await repositories.messages.deleteByUids(moving.mailboxId, [moving.uid]);
      await journal.touched(repositories.pendingWork, moving.threadId);
      if (twin.threadId !== moving.threadId) {
        await journal.touched(repositories.pendingWork, twin.threadId);
      }
    });
  }
}
