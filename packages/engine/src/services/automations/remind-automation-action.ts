import type { AutomationActionOf } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { ReminderRepository } from '../../ports/reminder-repository';
import type { MessageActionsService } from '../actions/message-actions-service';
import { type ActionEffect, NO_EFFECT } from './action-effect';
import type { AutomationActionContext, AutomationActionHandler } from './automation-action';

export const DAY_MS = 24 * 60 * 60_000;

export class RemindAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'remind'>>
{
  constructor(
    private readonly actions: MessageActionsService,
    private readonly reminders: ReminderRepository,
    private readonly clock: Clock,
  ) {}

  async run(
    { userId, arrival }: AutomationActionContext,
    { afterDays }: AutomationActionOf<'remind'>,
  ): Promise<ActionEffect> {
    const { threadId } = arrival.message;
    const at = new Date(this.clock.now().getTime() + afterDays * DAY_MS).toISOString();
    await this.actions.apply(userId, threadId, { type: 'remind', at });
    const reminder = await this.reminders.findActiveByThread(userId, threadId);
    if (reminder === null || Date.parse(reminder.remindAt) !== Date.parse(at)) {
      return NO_EFFECT;
    }
    return { ...NO_EFFECT, reminder: { id: reminder.id, remindAt: reminder.remindAt } };
  }
}
