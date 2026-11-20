import type { ThreadSummary, UserId } from '@relay/shared/domain';
import type { ReminderRepository } from '../../../ports/reminder-repository';
import type { MessageActionsService } from '../../actions/message-actions-service';
import type { ActivityReverser, RecordedAction, ReverseOutcome } from './activity-reverser';

export class RemindReverser implements ActivityReverser<'remind'> {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly reminders: ReminderRepository,
  ) {}

  async reverse(
    userId: UserId,
    thread: ThreadSummary,
    { reminder }: RecordedAction<'remind'>,
  ): Promise<ReverseOutcome> {
    if (reminder === null) {
      return 'skipped';
    }
    const active = await this.reminders.findActiveByThread(userId, thread.id);
    if (
      active?.id !== reminder.id ||
      Date.parse(active.remindAt) !== Date.parse(reminder.remindAt)
    ) {
      return 'skipped';
    }
    await this.actions.apply(userId, thread.id, { type: 'cancelReminder' });
    return 'undone';
  }
}
