import {
  type MailAccount,
  type Mailbox,
  type Message,
  placementIn,
  type ThreadId,
} from '@relay/shared/domain';
import type { MoveOriginWork } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { keepsSource } from '../actions/placement-transition';
import type { MovedCopyMerger } from '../actions/moved-copy-merger';
import { recordMoveOrigins } from '../shared/move-origins';
import { PENDING_UID } from '../shared/pending-uid';
import { legacyMoveRef, providerOpRef } from '../shared/provider-ops';

const TRASH_MOVE = { kind: 'move', role: 'trash' } as const;

const originOf = (message: Message, folder: Mailbox): MoveOriginWork => {
  const source = placementIn(message, folder.id);
  return {
    messageId: message.id,
    role: 'custom',
    mailboxId: folder.id,
    ...(source === undefined ? {} : { uid: source.uid }),
  };
};

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
    const origins = moved.messages.map((message) => originOf(message, folder));
    await recordMoveOrigins(pendingWork, account.id, 'trash-origin', origins, now);
    for (const message of moved.messages) {
      await this.dropPendingMoves(account, folder, message);
      const source = placementIn(message, folder.id);
      if (source === undefined) {
        continue;
      }
      const uid = moved.uidMap.get(source.uid) ?? PENDING_UID;
      const keepSource = keepsSource(account, folder.role, trash.role);
      const twin = await this.deps.merger.twinOf(account, message, trash, uid);
      if (twin !== null) {
        await this.deps.merger.merge(account, message, source, twin, keepSource);
        continue;
      }
      await messages.movePlacement(message.id, {
        from: folder.id,
        to: { mailboxId: trash.id, uid },
        keepSource,
      });
    }
    return [...new Set(moved.messages.map((message) => message.threadId))];
  }

  private async dropPendingMoves(
    account: MailAccount,
    folder: Mailbox,
    message: Message,
  ): Promise<void> {
    const refs = [legacyMoveRef(message.id), providerOpRef(message.id, TRASH_MOVE, folder.id)];
    for (const ref of refs) {
      const pendingMove = await this.deps.pendingWork.find({
        accountId: account.id,
        kind: 'provider-op',
        ref,
      });
      await this.deps.pendingWork.remove(pendingMove === null ? [] : [pendingMove]);
    }
  }
}
