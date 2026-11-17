import type { AiJobInput } from '@relay/shared/domain';
import type { AiJobFactory } from '../ai/ai-job-factory';
import type { AutomationActionContext, AutomationActionHandler } from './automation-action';
import { runsLegacyJiraTasks } from './automation-presets';

const enqueue = async (
  factory: AiJobFactory,
  { userId, automation }: AutomationActionContext,
  input: AiJobInput,
): Promise<void> => {
  await factory.enqueue(userId, {
    input,
    runner: automation.ai.runner,
    model: automation.ai.model,
    effort: automation.ai.effort,
  });
};

export class SummaryAutomationAction implements AutomationActionHandler {
  constructor(private readonly factory: AiJobFactory) {}

  run(context: AutomationActionContext): Promise<void> {
    const { message } = context.arrival;
    return enqueue(this.factory, context, {
      kind: 'summary',
      threadId: message.threadId,
      sourceMessageId: message.id,
    });
  }
}

export class TaskAutomationAction implements AutomationActionHandler {
  constructor(private readonly factory: AiJobFactory) {}

  run(context: AutomationActionContext): Promise<void> {
    if (runsLegacyJiraTasks(context.automation)) {
      return Promise.resolve();
    }
    const { message, jira } = context.arrival;
    return enqueue(this.factory, context, {
      kind: 'automationTask',
      threadId: message.threadId,
      messageId: message.id,
      automationId: context.automation.id,
      instructions: context.automation.ai.instructions,
      jiraKey: jira?.jiraKey ?? null,
    });
  }
}
