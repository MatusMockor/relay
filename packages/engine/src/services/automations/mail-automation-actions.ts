import type { AutomationActionOf, Message } from '@relay/shared/domain';
import type { MessageActionsService } from '../actions/message-actions-service';
import type { EngineEvents } from '../shared/engine-events';
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

  async run({ userId, automation, arrival }: AutomationActionContext): Promise<void> {
    const { message } = arrival;
    await this.events.emit(userId, 'automation.notified', {
      automationId: automation.id,
      automationName: automation.name,
      threadId: message.threadId,
      title: senderOf(message, automation.name),
      body: message.subject,
    });
  }
}

export class MarkReadAutomationAction implements AutomationActionHandler {
  constructor(private readonly actions: MessageActionsService) {}

  async run({ userId, arrival }: AutomationActionContext): Promise<void> {
    await this.actions.apply(userId, arrival.message.threadId, { type: 'markRead' });
  }
}

export class PinAutomationAction implements AutomationActionHandler {
  constructor(private readonly actions: MessageActionsService) {}

  async run({ userId, arrival }: AutomationActionContext): Promise<void> {
    await this.actions.pin(userId, arrival.message.threadId);
  }
}

export class ArchiveAutomationAction implements AutomationActionHandler {
  constructor(private readonly actions: MessageActionsService) {}

  async run({ userId, arrival }: AutomationActionContext): Promise<void> {
    await this.actions.apply(userId, arrival.message.threadId, { type: 'archive' });
  }
}

export class MoveToAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'moveTo'>>
{
  constructor(private readonly actions: MessageActionsService) {}

  async run(
    { userId, arrival }: AutomationActionContext,
    { mailboxId }: AutomationActionOf<'moveTo'>,
  ): Promise<void> {
    await this.actions.apply(userId, arrival.message.threadId, { type: 'move', mailboxId });
  }
}

export class AddLabelAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'addLabel'>>
{
  constructor(private readonly actions: MessageActionsService) {}

  async run(
    { userId, arrival }: AutomationActionContext,
    { labelId }: AutomationActionOf<'addLabel'>,
  ): Promise<void> {
    await this.actions.apply(userId, arrival.message.threadId, { type: 'addLabel', labelId });
  }
}
