import type { MailAccount, Mailbox, Message, ThreadId } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { MovedCopyMerger } from '../actions/moved-copy-merger';
import { recordMoveOrigins } from '../shared/move-origins';
import { PENDING_UID } from '../shared/pending-uid';

export const cachedMessages = async (
  messages: MessageRepository,
  folder: Mailbox,
  uids: readonly number[],
): Promise<Message[]> => {
  const found: Message[] = [];
  for (const uid of uids) {
    const message = await messages.findByLocation({ mailboxId: folder.id, uid });
    if (message !== null) {
      found.push(message);
    }
  }
  return found;
};

export interface TrashedCopiesDeps {
  readonly messages: MessageRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly merger: MovedCopyMerger;
  readonly clock: Clock;
}

export class TrashedCopies {
  constructor(private readonly deps: TrashedCopiesDeps) {}

  async record(
    account: MailAccount,
    folder: Mailbox,
    trash: Mailbox,
    moved: { readonly messages: readonly Message[]; readonly uidMap: ReadonlyMap<number, number> },
  ): Promise<ThreadId[]> {
    const { messages, pendingWork } = this.deps;
    const now = this.deps.clock.now().toISOString();
    const origins = moved.messages.map((message) => ({
      messageId: message.id,
      role: 'custom' as const,
      mailboxId: folder.id,
    }));
    await recordMoveOrigins(pendingWork, account.id, 'trash-origin', origins, now);
    for (const message of moved.messages) {
      const pendingMove = await pendingWork.find({
        accountId: account.id,
        kind: 'provider-op',
        ref: `${message.id}:move`,
      });
      await pendingWork.remove(pendingMove === null ? [] : [pendingMove]);
      const uid = moved.uidMap.get(message.uid) ?? PENDING_UID;
      const twin = await this.deps.merger.twinOf(account, message, trash, uid);
      if (twin !== null) {
        await this.deps.merger.merge(account, message, twin);
        continue;
      }
      await messages.move(message.id, { mailboxId: trash.id, uid });
    }
    return [...new Set(moved.messages.map((message) => message.threadId))];
  }
}
