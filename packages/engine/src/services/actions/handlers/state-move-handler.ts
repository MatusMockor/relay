import type { MailboxRole, ThreadState, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { Logger } from '../../../ports/logger';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { MessageRepository } from '../../../ports/message-repository';
import type { ThreadRepository } from '../../../ports/thread-repository';
import { PENDING_UID } from '../../shared/pending-uid';
import type { RoleMailboxEnsurer } from '../../shared/role-mailbox-ensurer';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';

export type StateMoveAction = 'done' | 'undone' | 'trash' | 'restore';

interface StateMove {
  readonly state: ThreadState;
  readonly from: readonly MailboxRole[];
  readonly to: MailboxRole;
}

const STATE_MOVES: Readonly<Record<StateMoveAction, StateMove>> = {
  done: { state: 'done', from: ['inbox'], to: 'archive' },
  undone: { state: 'inbox', from: ['archive'], to: 'inbox' },
  trash: { state: 'trash', from: ['inbox', 'archive'], to: 'trash' },
  restore: { state: 'inbox', from: ['trash'], to: 'inbox' },
};

export interface StateMoveHandlerDeps {
  readonly threads: ThreadRepository;
  readonly messages: MessageRepository;
  readonly mailboxes: MailboxRepository;
  readonly mirror: ProviderMirror;
  readonly roleMailboxes: RoleMailboxEnsurer;
  readonly logger: Logger;
}

export class StateMoveHandler {
  constructor(private readonly deps: StateMoveHandlerDeps) {}

  async handle(context: ThreadActionContext, action: StateMoveAction): Promise<ThreadSummary> {
    const move = STATE_MOVES[action];
    const thread = await this.deps.threads.updateState(context.userId, context.thread.id, {
      state: move.state,
      remindAt: context.thread.remindAt,
    });
    if (thread === null) {
      throw new NotFoundError('Thread', context.thread.id);
    }
    await this.mirror(context, move);
    return thread;
  }

  private async mirror(context: ThreadActionContext, move: StateMove): Promise<void> {
    const mailboxes = await this.deps.mailboxes.listForSync(context.account.id);
    const sourceIds = new Set(
      mailboxes.filter((mailbox) => move.from.includes(mailbox.role)).map((mailbox) => mailbox.id),
    );
    const sources = context.messages.filter((message) => sourceIds.has(message.mailboxId));
    await this.deps.mirror.apply(context.account, sources, async (provider, batch) => {
      const target = await this.deps.roleMailboxes.ensure(context.account, move.to, provider);
      if (target === null) {
        this.deps.logger.warn('No target mailbox for thread move', {
          accountId: context.account.id,
          role: move.to,
        });
        return;
      }
      const result = await provider.move(batch.mailbox.path, batch.uids, target.path);
      for (const message of batch.messages) {
        await this.deps.messages.move(message.id, {
          mailboxId: target.id,
          uid: result.uidMap.get(message.uid) ?? PENDING_UID,
        });
      }
    });
  }
}
