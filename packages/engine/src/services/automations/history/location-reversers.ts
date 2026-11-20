import type { AutomationActionOf, ThreadSummary, UserId } from '@relay/shared/domain';
import type { MessageActionsService } from '../../actions/message-actions-service';
import type { ActivityReverser, ReverseOutcome } from './activity-reverser';
import type { LocatedMoveTarget, MoveTargetProbe } from './move-target-probe';

const isFiledAway = (thread: ThreadSummary): boolean =>
  thread.state === 'done' && thread.markedDone !== true;

export class ArchiveReverser implements ActivityReverser<'archive'> {
  constructor(private readonly actions: MessageActionsService) {}

  async reverse(userId: UserId, thread: ThreadSummary): Promise<ReverseOutcome> {
    if (!isFiledAway(thread)) {
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
  ) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    { mailboxId }: AutomationActionOf<'moveTo'>,
  ): Promise<ReverseOutcome> {
    const target = await this.probe.locate(userId, thread, mailboxId);
    if (target === null) {
      return 'skipped';
    }
    if (target.role === 'inbox') {
      await this.actions.apply(userId, thread.id, { type: 'undoMove' });
      return 'undone';
    }
    if (thread.state === 'inbox') {
      return this.dropLabel(userId, thread, target);
    }
    if (!isFiledAway(thread)) {
      return 'skipped';
    }
    await this.dropLabel(userId, await this.returnToInbox(userId, thread), target);
    return 'undone';
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
