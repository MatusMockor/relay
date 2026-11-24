import type { AccountId, MessageId, MoveOriginRef, ThreadSummary } from '@relay/shared/domain';
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
import { dropSupersededLabelOps } from './superseded-label-ops';
import { requireUpserted } from './require-upserted';
import { physicalKeyOf } from './folder-move-plans';
import type {
  OriginChanges,
  PlannedMove,
  StateMoveAction,
  StateMovePlan,
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
  markedDone: boolean,
  now: string,
): Promise<MoveOriginRef[]> => {
  const recorded: MoveOriginRef[] = [];
  for (const origin of origins) {
    await forgetMoveOrigins(pendingWork, accountId, origin.kind, origin.forget);
    const remember =
      origin.kind === 'move-origin' && markedDone
        ? origin.remember.map((placement) => ({ ...placement, markedDone }))
        : origin.remember;
    const refs = await recordMoveOrigins(pendingWork, accountId, origin.kind, remember, now);
    recorded.push(...(origin.kind === 'move-origin' ? refs : []));
  }
  return recorded;
};

export interface StateMoveOutcome {
  readonly thread: ThreadSummary;
  readonly moved: readonly MessageId[];
  readonly labelled: readonly MessageId[];
  readonly origins: readonly MoveOriginRef[];
}

const movedBy = (plan: StateMovePlan, context: ThreadActionContext, copies: MailCopies) => {
  const touched = new Set<string>([
    ...plan.moves.map(({ messageId }) => messageId),
    ...plan.labels.flatMap((change) => (change.value ? change.messageIds : [])),
  ]);
  const keys = new Set(
    context.messages
      .filter((message) => touched.has(message.id))
      .map((message) => physicalKeyOf(copies, message)),
  );
  return context.messages
    .filter((message) => touched.has(message.id) || keys.has(physicalKeyOf(copies, message)))
    .map(({ id }) => id);
};

export class StateMoveHandler {
  constructor(private readonly deps: StateMoveHandlerDeps) {}

  handle(context: ThreadActionContext, action: StateMoveAction): Promise<ThreadSummary> {
    return this.execute(context, (messages, thread, copies) =>
      planStateMove(action, messages, thread, copies),
    );
  }

  handleTracked(context: ThreadActionContext, action: StateMoveAction): Promise<StateMoveOutcome> {
    return this.executeTracked(context, (messages, thread, copies) =>
      planStateMove(action, messages, thread, copies),
    );
  }

  async execute(context: ThreadActionContext, planner: StateMovePlanner): Promise<ThreadSummary> {
    return (await this.executeTracked(context, planner)).thread;
  }

  async executeTracked(
    context: ThreadActionContext,
    planner: StateMovePlanner,
  ): Promise<StateMoveOutcome> {
    const copies = MailCopies.of(context.account);
    const plan = planner(await this.deps.locator.locate(context), context.thread, copies);
    const labels = await resolveLabelChanges(this.deps.labels, context.userId, plan.labels);
    const accountId = context.account.id;
    const now = this.deps.clock.now().toISOString();
    const { thread, ops, origins } = await this.deps.unitOfWork.run(async (repositories) => {
      const updated = await repositories.threads.updateState(context.userId, context.thread.id, {
        state: plan.state,
        markedDone: plan.state === 'inbox' ? false : plan.markedDone,
        remindAt: context.thread.remindAt,
      });
      if (updated === null) {
        throw new NotFoundError('Thread', context.thread.id);
      }
      await dropSupersededLabelOps(
        repositories.pendingWork,
        accountId,
        copies,
        context.messages,
        labels,
      );
      const labelOps = await writeLabelChanges(repositories, accountId, labels, now);
      const moveOps = await recordProviderOps(
        repositories.pendingWork,
        accountId,
        plan.moves.map((move) => ({
          messageId: move.messageId,
          change: moveChange(move),
          source: move.source,
        })),
        now,
      );
      const origins = await applyOrigins(
        repositories.pendingWork,
        accountId,
        plan.origins,
        context.thread.markedDone === true,
        now,
      );
      if (labels.length === 0) {
        return { thread: updated, ops: [...labelOps, ...moveOps], origins };
      }
      const refreshed = await refreshThread(repositories, context.userId, accountId, updated.id);
      return {
        thread: requireUpserted(refreshed, updated.id),
        ops: [...labelOps, ...moveOps],
        origins,
      };
    });
    await this.deps.mirror.apply(context.account, ops);
    return {
      thread,
      moved: movedBy(plan, context, copies),
      labelled: plan.labels.flatMap((change) => (change.value ? change.messageIds : [])),
      origins,
    };
  }
}
