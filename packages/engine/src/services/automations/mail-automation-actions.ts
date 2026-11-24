import type { AutomationActionOf, Message } from '@relay/shared/domain';
import type { MessageActionsService } from '../actions/message-actions-service';
import type { TrackedAction } from '../actions/message-changes';
import type { EngineEvents } from '../shared/engine-events';
import { type ActionEffect, NO_EFFECT, trackedEffect } from './action-effect';
import type { AutomationActionContext, AutomationActionHandler } from './automation-action';

const senderOf = (message: Message, fallback: string): string => {
  const name = message.from?.name?.trim() ?? '';
  if (name !== '') {
    return name;
  }
  return message.from?.email ?? fallback;
};

export class NotifyAutomationAction implements AutomationActionHandler {
  constructor(private readonly events: EngineEvents) {}

  async run({ userId, automation, arrival }: AutomationActionContext): Promise<ActionEffect> {
    const { message } = arrival;
    await this.events.emit(userId, 'automation.notified', {
      automationId: automation.id,
      automationName: automation.name,
      threadId: message.threadId,
      title: senderOf(message, automation.name),
      body: message.subject,
    });
    return NO_EFFECT;
  }
}

export class TrackedAutomationAction implements AutomationActionHandler {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly tracked: TrackedAction,
  ) {}

  async run({ userId, arrival }: AutomationActionContext): Promise<ActionEffect> {
    return trackedEffect(
      await this.actions.applyTracked(userId, arrival.message.threadId, this.tracked),
    );
  }
}

export class AddLabelAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'addLabel'>>
{
  constructor(private readonly actions: MessageActionsService) {}

  async run(
    { userId, arrival }: AutomationActionContext,
    { labelId }: AutomationActionOf<'addLabel'>,
  ): Promise<ActionEffect> {
    return trackedEffect(
      await this.actions.applyTracked(userId, arrival.message.threadId, {
        type: 'addLabel',
        labelId,
      }),
    );
  }
}

export class MoveToAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'moveTo'>>
{
  constructor(private readonly actions: MessageActionsService) {}

  async run(
    { userId, arrival }: AutomationActionContext,
    { mailboxId }: AutomationActionOf<'moveTo'>,
  ): Promise<ActionEffect> {
    return trackedEffect(
      await this.actions.applyTracked(userId, arrival.message.threadId, {
        type: 'move',
        mailboxId,
      }),
    );
  }
}
