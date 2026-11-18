import type { AccountId, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { Clock } from '../../../ports/clock';
import type { LabelRepository } from '../../../ports/label-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { MailCopies } from '../../shared/mail-copies';
import { forgetMoveOrigins, recordMoveOrigins } from '../../shared/move-origins';
import { recordProviderOps } from '../../shared/provider-ops';
import { refreshThread } from '../../shared/thread-refresh';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { resolveLabelChanges, writeLabelChanges } from './label-change-writer';
import type { MessageLocator } from './message-locator';
import { requireUpserted } from './require-upserted';
import type {
  OriginChanges,
  PlannedMove,
  StateMoveAction,
  StateMovePlanner,
} from './state-move-plan';
import { planStateMove } from './state-move-plans';

export interface StateMoveHandlerDeps {
  readonly locator: MessageLocator;
  readonly labels: LabelRepository;
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
  origins: readonly OriginChanges[],
  now: string,
): Promise<void> => {
  for (const origin of origins) {
    await forgetMoveOrigins(pendingWork, accountId, origin.kind, origin.forget);
    await recordMoveOrigins(pendingWork, accountId, origin.kind, origin.remember, now);
  }
};

export class StateMoveHandler {
  constructor(private readonly deps: StateMoveHandlerDeps) {}

  handle(context: ThreadActionContext, action: StateMoveAction): Promise<ThreadSummary> {
    return this.execute(context, (messages, thread, copies) =>
      planStateMove(action, messages, thread, copies),
    );
  }

  async execute(context: ThreadActionContext, planner: StateMovePlanner): Promise<ThreadSummary> {
    const plan = planner(
      await this.deps.locator.locate(context),
      context.thread,
      MailCopies.of(context.account),
    );
    const labels = await resolveLabelChanges(this.deps.labels, context.userId, plan.labels);
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
      const labelOps = await writeLabelChanges(repositories, accountId, labels, now);
      const moveOps = await recordProviderOps(
        repositories.pendingWork,
        accountId,
        plan.moves.map((move) => ({ messageId: move.messageId, change: moveChange(move) })),
        now,
      );
      await applyOrigins(repositories.pendingWork, accountId, plan.origins, now);
      if (labels.length === 0) {
        return { thread: updated, ops: [...labelOps, ...moveOps] };
      }
      const refreshed = await refreshThread(repositories, context.userId, accountId, updated.id);
      return {
        thread: requireUpserted(refreshed, updated.id),
        ops: [...labelOps, ...moveOps],
      };
    });
    await this.deps.mirror.apply(context.account, ops);
    return thread;
  }
}
