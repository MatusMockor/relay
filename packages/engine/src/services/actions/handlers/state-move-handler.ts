import type { MailboxRole, Message, ThreadState, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { Clock } from '../../../ports/clock';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { pendingMoveRoles, recordProviderOps } from '../../shared/provider-ops';
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
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
  readonly clock: Clock;
}

export class StateMoveHandler {
  constructor(private readonly deps: StateMoveHandlerDeps) {}

  async handle(context: ThreadActionContext, action: StateMoveAction): Promise<ThreadSummary> {
    const move = STATE_MOVES[action];
    const sources = await this.sources(context, move);
    const { thread, ops } = await this.deps.unitOfWork.run(async (repositories) => {
      const updated = await repositories.threads.updateState(context.userId, context.thread.id, {
        state: move.state,
        remindAt: context.thread.remindAt,
      });
      if (updated === null) {
        throw new NotFoundError('Thread', context.thread.id);
      }
      const recorded = await recordProviderOps(
        repositories.pendingWork,
        context.account.id,
        sources.map((message) => ({
          messageId: message.id,
          change: { kind: 'move', role: move.to } as const,
        })),
        this.deps.clock.now().toISOString(),
      );
      return { thread: updated, ops: recorded };
    });
    await this.deps.mirror.apply(context.account, ops);
    return thread;
  }

  private async sources(context: ThreadActionContext, move: StateMove): Promise<Message[]> {
    const mailboxes = await this.deps.mailboxes.listForSync(context.account.id);
    const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
    const pending = await pendingMoveRoles(this.deps.pendingWork, context.account.id);
    return context.messages.filter((message) => {
      const role = pending.get(message.id) ?? roles.get(message.mailboxId);
      return role !== undefined && move.from.includes(role);
    });
  }
}
