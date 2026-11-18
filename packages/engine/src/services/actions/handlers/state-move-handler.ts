import type { AccountId, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { Clock } from '../../../ports/clock';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { MailCopies } from '../../shared/mail-copies';
import { forgetMoveOrigins, moveOrigins, recordMoveOrigins } from '../../shared/move-origins';
import { pendingMoveTargets, recordProviderOps } from '../../shared/provider-ops';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import type {
  LocatedMessage,
  OriginChanges,
  PlannedMove,
  StateMoveAction,
} from './state-move-plan';
import { planStateMove } from './state-move-plans';

export interface StateMoveHandlerDeps {
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
  readonly clock: Clock;
}

const moveChange = (move: PlannedMove) =>
  move.mailboxId === undefined
    ? ({ kind: 'move', role: move.role } as const)
    : ({ kind: 'move', role: move.role, mailboxId: move.mailboxId } as const);

const applyOrigins = async (
  pendingWork: PendingWorkRepository,
  accountId: AccountId,
  origins: OriginChanges | null,
  now: string,
): Promise<void> => {
  if (origins === null) {
    return;
  }
  await recordMoveOrigins(pendingWork, accountId, origins.kind, origins.remember, now);
  await forgetMoveOrigins(pendingWork, accountId, origins.kind, origins.forget);
};

export class StateMoveHandler {
  constructor(private readonly deps: StateMoveHandlerDeps) {}

  async handle(context: ThreadActionContext, action: StateMoveAction): Promise<ThreadSummary> {
    const plan = planStateMove(
      action,
      await this.located(context),
      context.thread,
      MailCopies.of(context.account),
    );
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
        plan.moves.map((move) => ({ messageId: move.messageId, change: moveChange(move) })),
        now,
      );
      await applyOrigins(repositories.pendingWork, accountId, plan.origins, now);
      return { thread: updated, ops: recorded };
    });
    await this.deps.mirror.apply(context.account, ops);
    return thread;
  }

  private async located(context: ThreadActionContext): Promise<LocatedMessage[]> {
    const accountId = context.account.id;
    const { pendingWork } = this.deps;
    const mailboxes = await this.deps.mailboxes.listForSync(accountId);
    const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
    const pending = await pendingMoveTargets(pendingWork, accountId);
    const trashed = await moveOrigins(pendingWork, accountId, 'trash-origin');
    const reported = await moveOrigins(pendingWork, accountId, 'spam-origin');
    return context.messages.map((message) => {
      const target = pending.get(message.id);
      const role = target?.role ?? roles.get(message.mailboxId);
      const mailboxId = target === undefined ? message.mailboxId : target.mailboxId;
      const origins = role === 'spam' ? reported : trashed;
      return {
        message,
        role,
        mailboxId,
        origin: origins.get(message.id),
        moving: pending.has(message.id),
      };
    });
  }
}
