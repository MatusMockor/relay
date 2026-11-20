import type { AutomationActionOf, ThreadSummary, UserId } from '@relay/shared/domain';
import type { MessageActionsService } from '../../actions/message-actions-service';
import type { ActivityReverser, ReverseOutcome } from './activity-reverser';

export class MarkReadReverser implements ActivityReverser<'markRead'> {
  constructor(private readonly actions: MessageActionsService) {}

  async reverse(userId: UserId, thread: ThreadSummary): Promise<ReverseOutcome> {
    if (thread.unread) {
      return 'skipped';
    }
    await this.actions.apply(userId, thread.id, { type: 'markUnread' });
    return 'undone';
  }
}

export class PinReverser implements ActivityReverser<'pin'> {
  constructor(private readonly actions: MessageActionsService) {}

  async reverse(userId: UserId, thread: ThreadSummary): Promise<ReverseOutcome> {
    await this.actions.unpin(userId, thread.id);
    return 'undone';
  }
}

export class AddLabelReverser implements ActivityReverser<'addLabel'> {
  constructor(private readonly actions: MessageActionsService) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    { labelId }: AutomationActionOf<'addLabel'>,
  ): Promise<ReverseOutcome> {
    if (!thread.labelIds.includes(labelId)) {
      return 'skipped';
    }
    await this.actions.apply(userId, thread.id, { type: 'removeLabel', labelId });
    return 'undone';
  }
}
