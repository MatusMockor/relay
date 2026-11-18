import type { MailAccount, Mailbox, Message, ThreadId } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { MailProvider } from '../../ports/mail-provider';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import { forgetMoveOrigins, recordMoveOrigins } from '../shared/move-origins';
import { type PendingProviderOp, recordProviderOps } from '../shared/provider-ops';

export interface FolderTrashDeps {
  readonly messages: MessageRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly unitOfWork: UnitOfWork;
  readonly replayer: ProviderOpReplayer;
  readonly clock: Clock;
}

export interface TrashOutcome {
  readonly threadIds: readonly ThreadId[];
  readonly complete: boolean;
}

export class FolderTrash {
  constructor(private readonly deps: FolderTrashDeps) {}

  async empty(
    account: MailAccount,
    provider: MailProvider,
    folder: Mailbox,
  ): Promise<TrashOutcome> {
    const messages = await this.contents(folder);
    const threadIds = [...new Set(messages.map((message) => message.threadId))];
    if (messages.length === 0) {
      return { threadIds, complete: true };
    }
    const ops = await this.record(account, folder, messages);
    await this.deps.replayer.replay(account, provider, ops);
    const stuck = await this.stillPending(ops);
    if (stuck.length > 0) {
      await this.abandon(account, stuck);
    }
    return { threadIds, complete: stuck.length === 0 };
  }

  private async contents(folder: Mailbox): Promise<Message[]> {
    const messages: Message[] = [];
    for (const uid of await this.deps.messages.listUids(folder.id)) {
      const message = await this.deps.messages.findByLocation({ mailboxId: folder.id, uid });
      if (message !== null) {
        messages.push(message);
      }
    }
    return messages;
  }

  private record(
    account: MailAccount,
    folder: Mailbox,
    messages: readonly Message[],
  ): Promise<PendingProviderOp[]> {
    const now = this.deps.clock.now().toISOString();
    return this.deps.unitOfWork.run(async ({ pendingWork }) => {
      const ops = await recordProviderOps(
        pendingWork,
        account.id,
        messages.map((message) => ({
          messageId: message.id,
          change: { kind: 'move', role: 'trash' },
        })),
        now,
      );
      await recordMoveOrigins(
        pendingWork,
        account.id,
        'trash-origin',
        messages.map((message) => ({
          messageId: message.id,
          role: 'custom',
          mailboxId: folder.id,
        })),
        now,
      );
      return ops;
    });
  }

  private async stillPending(ops: readonly PendingProviderOp[]): Promise<PendingProviderOp[]> {
    const stuck: PendingProviderOp[] = [];
    for (const op of ops) {
      const stored = await this.deps.pendingWork.find(op);
      if (stored !== null) {
        stuck.push(stored);
      }
    }
    return stuck;
  }

  private async abandon(account: MailAccount, stuck: readonly PendingProviderOp[]): Promise<void> {
    await this.deps.pendingWork.remove(stuck);
    await forgetMoveOrigins(
      this.deps.pendingWork,
      account.id,
      'trash-origin',
      stuck.map((op) => op.payload.messageId),
    );
  }
}
