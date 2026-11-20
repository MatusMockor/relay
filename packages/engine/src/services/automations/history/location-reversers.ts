import type {
  AutomationActivityAction,
  Message,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import type { MessageRepository } from '../../../ports/message-repository';
import type { MessageActionsService } from '../../actions/message-actions-service';
import type { ActivityReverser, RecordedAction, ReverseOutcome } from './activity-reverser';
import type { LocatedMoveTarget, MoveTargetProbe } from './move-target-probe';

const isFiledAway = (thread: ThreadSummary): boolean =>
  thread.state === 'done' && thread.markedDone !== true;

const placementOf = (messages: readonly Message[]): string =>
  messages
    .map(
      (message) => `${message.id}:${message.mailboxId}:${[...message.labelIds].sort().join(',')}`,
    )
    .sort()
    .join('|');

const cameFromInbox = (recorded: AutomationActivityAction): boolean =>
  recorded.previousState === 'inbox';

export class ArchiveReverser implements ActivityReverser<'archive'> {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly probe: MoveTargetProbe,
  ) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    recorded: RecordedAction<'archive'>,
  ): Promise<ReverseOutcome> {
    if (!cameFromInbox(recorded) || !isFiledAway(thread)) {
      return 'skipped';
    }
    if (!(await this.probe.hasMailIn(userId, thread, 'archive'))) {
      return 'skipped';
    }
    await this.actions.apply(userId, thread.id, { type: 'undone' });
    return 'undone';
  }
}

export class MoveToReverser implements ActivityReverser<'moveTo'> {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly probe: MoveTargetProbe,
    private readonly messages: MessageRepository,
  ) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    recorded: RecordedAction<'moveTo'>,
  ): Promise<ReverseOutcome> {
    const target = await this.probe.locate(userId, thread, recorded.action.mailboxId);
    if (target === null) {
      return 'skipped';
    }
    if (target.role === 'inbox') {
      return this.undoMove(userId, thread);
    }
    if (thread.state === 'inbox') {
      return this.dropLabel(userId, thread, target);
    }
    if (!isFiledAway(thread)) {
      return 'skipped';
    }
    if (!cameFromInbox(recorded)) {
      return this.undoMove(userId, thread);
    }
    await this.dropLabel(userId, await this.returnToInbox(userId, thread), target);
    return 'undone';
  }

  private async undoMove(userId: UserId, thread: ThreadSummary): Promise<ReverseOutcome> {
    const before = placementOf(await this.messages.listByThread(userId, thread.id));
    await this.actions.apply(userId, thread.id, { type: 'undoMove' });
    const after = placementOf(await this.messages.listByThread(userId, thread.id));
    return before === after ? 'skipped' : 'undone';
  }

  private async returnToInbox(userId: UserId, thread: ThreadSummary): Promise<ThreadSummary> {
    const returned = await this.actions.apply(userId, thread.id, { type: 'undoMove' });
    if (returned.state === 'inbox') {
      return returned;
    }
    return this.actions.apply(userId, thread.id, { type: 'undone' });
  }

  private async dropLabel(
    userId: UserId,
    thread: ThreadSummary,
    { labelId }: LocatedMoveTarget,
  ): Promise<ReverseOutcome> {
    if (labelId === null || !thread.labelIds.includes(labelId)) {
      return 'skipped';
    }
    await this.actions.apply(userId, thread.id, { type: 'removeLabel', labelId });
    return 'undone';
  }
}
