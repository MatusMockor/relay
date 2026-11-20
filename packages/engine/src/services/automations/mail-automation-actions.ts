import type { AutomationActionOf, Message } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import type { MessageRepository } from '../../ports/message-repository';
import type { MessageActionsService } from '../actions/message-actions-service';
import type { TrackedAction } from '../actions/message-changes';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import { type ActionEffect, NO_EFFECT, relocatedMessages, writtenEffect } from './action-effect';
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

export class FlagAutomationAction implements AutomationActionHandler {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly tracked: TrackedAction,
  ) {}

  async run({ userId, arrival }: AutomationActionContext): Promise<ActionEffect> {
    return writtenEffect(
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
    return writtenEffect(
      await this.actions.applyTracked(userId, arrival.message.threadId, {
        type: 'addLabel',
        labelId,
      }),
    );
  }
}

export class LocationTracker {
  constructor(
    private readonly actions: MessageActionsService,
    private readonly messages: MessageRepository,
    private readonly logger: Logger,
  ) {}

  async track(
    { userId, arrival }: AutomationActionContext,
    tracked: TrackedAction,
  ): Promise<ActionEffect> {
    const { threadId } = arrival.message;
    const change = await this.actions.applyTracked(userId, threadId, tracked);
    const after = await this.messages.listByThread(userId, threadId).catch((error: unknown) => {
      this.logger.warn('Reading the messages an automation moved failed', {
        threadId,
        error: errorMessage(error),
      });
      return null;
    });
    return {
      changed:
        after === null
          ? change.before.map(({ id }) => id)
          : relocatedMessages(change.before, after),
      previousState: change.previousState,
    };
  }
}

export class ArchiveAutomationAction implements AutomationActionHandler {
  constructor(private readonly locations: LocationTracker) {}

  run(context: AutomationActionContext): Promise<ActionEffect> {
    return this.locations.track(context, { type: 'archive' });
  }
}

export class MoveToAutomationAction
  implements AutomationActionHandler<AutomationActionOf<'moveTo'>>
{
  constructor(private readonly locations: LocationTracker) {}

  run(
    context: AutomationActionContext,
    { mailboxId }: AutomationActionOf<'moveTo'>,
  ): Promise<ActionEffect> {
    return this.locations.track(context, { type: 'move', mailboxId });
  }
}
