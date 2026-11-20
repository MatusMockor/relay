import { type AiJobInput, aiModelChoiceIssue } from '@relay/shared/domain';
import type { AiJobFactory } from '../ai/ai-job-factory';
import { type ActionEffect, NO_EFFECT } from './action-effect';
import type { AutomationActionContext, AutomationActionHandler } from './automation-action';
import { runsLegacyJiraTasks } from './automation-presets';

const enqueue = async (
  factory: AiJobFactory,
  { userId, automation }: AutomationActionContext,
  input: AiJobInput,
): Promise<ActionEffect> => {
  const { runner, model, effort } = automation.ai;
  const known = aiModelChoiceIssue({ runner, model, effort }) === null;
  await factory.enqueue(userId, {
    input,
    runner,
    model: known ? model : null,
    effort: known ? effort : null,
  });
  return NO_EFFECT;
};

export class SummaryAutomationAction implements AutomationActionHandler {
  constructor(private readonly factory: AiJobFactory) {}

  run(context: AutomationActionContext): Promise<ActionEffect> {
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

  run(context: AutomationActionContext): Promise<ActionEffect> {
    if (runsLegacyJiraTasks(context.automation)) {
      return Promise.resolve(NO_EFFECT);
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
