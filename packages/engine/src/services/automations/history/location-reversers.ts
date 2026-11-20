import type {
  AutomationActivityAction,
  Message,
  ThreadSummary,
  UserId,
} from '@relay/shared/domain';
import type { MessageRepository } from '../../../ports/message-repository';
import type { MessageActionsService } from '../../actions/message-actions-service';
import type { ActivityReverser, RecordedAction, ReverseOutcome } from './activity-reverser';
import type { MoveOriginProbe } from './move-origin-probe';
import type { LocatedMoveTarget, MoveTargetProbe } from './move-target-probe';

const isFiledAway = (thread: ThreadSummary): boolean =>
  thread.state === 'done' && thread.markedDone !== true;

const cameFromInbox = (recorded: AutomationActivityAction): boolean =>
  recorded.previousState === 'inbox';

const placementOf = (messages: readonly Message[]): string =>
  messages
    .map(
      (message) => `${message.id}:${message.mailboxId}:${[...message.labelIds].sort().join(',')}`,
    )
    .sort()
    .join('|');

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
    const archived = await this.probe.recordedIn(userId, thread, recorded.changed, ['archive']);
    if (archived.length === 0) {
      return 'skipped';
    }
    await this.actions.revert(userId, thread.id, archived, { type: 'returnToInbox' });
    return 'undone';
  }
}

export class MoveToReverser implements ActivityReverser<'moveTo'> {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly probe: MoveTargetProbe,
    private readonly origins: MoveOriginProbe,
    private readonly messages: MessageRepository,
  ) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    recorded: RecordedAction<'moveTo'>,
    recordedAt: string,
  ): Promise<ReverseOutcome> {
    const target = await this.probe.locate(userId, thread, recorded.action.mailboxId);
    if (target === null) {
      return 'skipped';
    }
    if (target.role !== 'inbox' && thread.state === 'inbox') {
      return this.dropLabel(userId, thread, target);
    }
    if (target.role !== 'inbox' && !isFiledAway(thread)) {
      return 'skipped';
    }
    const messages = await this.messages.listByThread(userId, thread.id);
    const replaced = await this.origins.replacedSince(
      thread.accountId,
      messages.map(({ id }) => id),
      recordedAt,
    );
    if (!replaced && (target.role === 'inbox' || !cameFromInbox(recorded))) {
      return this.undoMove(userId, thread, messages);
    }
    if (target.role === 'inbox' || !cameFromInbox(recorded)) {
      return 'skipped';
    }
    const returned = replaced ? thread : await this.returnThroughOrigins(userId, thread);
    const current =
      returned.state === 'inbox' ? returned : await this.returnRecorded(userId, thread, recorded);
    if (current === null) {
      return 'skipped';
    }
    await this.dropLabel(userId, current, target);
    return 'undone';
  }

  private async undoMove(
    userId: UserId,
    thread: ThreadSummary,
    before: readonly Message[],
  ): Promise<ReverseOutcome> {
    await this.actions.apply(userId, thread.id, { type: 'undoMove' });
    const after = await this.messages.listByThread(userId, thread.id);
    return placementOf(before) === placementOf(after) ? 'skipped' : 'undone';
  }

  private returnThroughOrigins(userId: UserId, thread: ThreadSummary): Promise<ThreadSummary> {
    return this.actions.apply(userId, thread.id, { type: 'undoMove' });
  }

  private async returnRecorded(
    userId: UserId,
    thread: ThreadSummary,
    recorded: RecordedAction<'moveTo'>,
  ): Promise<ThreadSummary | null> {
    const moved = await this.probe.recordedIn(userId, thread, recorded.changed, [
      'archive',
      'custom',
    ]);
    if (moved.length === 0) {
      return null;
    }
    return this.actions.revert(userId, thread.id, moved, { type: 'returnToInbox' });
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
