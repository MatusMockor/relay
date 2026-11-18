import type { ThreadSummary } from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { Clock } from '../../../ports/clock';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { pendingMoveRoles, recordProviderOps } from '../../shared/provider-ops';
import { forgetTrashOrigins, recordTrashOrigins, trashOrigins } from '../../shared/trash-origins';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { type LocatedMessage, planStateMove, type StateMoveAction } from './state-move-plans';

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
    const plan = planStateMove(action, await this.located(context), context.thread);
    const accountId = context.account.id;
    const now = this.deps.clock.now().toISOString();
    const { thread, ops } = await this.deps.unitOfWork.run(async (repositories) => {
      const updated = await repositories.threads.updateState(context.userId, context.thread.id, {
        state: plan.state,
        remindAt: context.thread.remindAt,
      });
      if (updated === null) {
        throw new NotFoundError('Thread', context.thread.id);
      }
      const recorded = await recordProviderOps(
        repositories.pendingWork,
        accountId,
        plan.moves.map((move) => ({
          messageId: move.messageId,
          change: { kind: 'move', role: move.role } as const,
        })),
        now,
      );
      await recordTrashOrigins(repositories.pendingWork, accountId, plan.remember, now);
      await forgetTrashOrigins(repositories.pendingWork, accountId, plan.forget);
      return { thread: updated, ops: recorded };
    });
    await this.deps.mirror.apply(context.account, ops);
    return thread;
  }

  private async located(context: ThreadActionContext): Promise<LocatedMessage[]> {
    const accountId = context.account.id;
    const mailboxes = await this.deps.mailboxes.listForSync(accountId);
    const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
    const pending = await pendingMoveRoles(this.deps.pendingWork, accountId);
    const origins = await trashOrigins(this.deps.pendingWork, accountId);
    return context.messages.map((message) => ({
      message,
      role: pending.get(message.id) ?? roles.get(message.mailboxId),
      origin: origins.get(message.id),
    }));
  }
}
