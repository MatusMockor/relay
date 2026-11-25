import type { CreateAiJobBody } from '@relay/shared/api';
import { type AiJobInput, type Automation, aiModelChoiceIssue } from '@relay/shared/domain';
import type { AiJobFactory } from '../ai/ai-job-factory';
import { AutomationActionRefusal } from './automation-action-refusal';
import { type ActionEffect, NO_EFFECT } from './action-effect';
import type { AutomationActionContext, AutomationActionHandler } from './automation-action';
import { runsLegacyJiraTasks } from './automation-presets';

const jobBody = (automation: Automation, input: AiJobInput): CreateAiJobBody => {
  const { runner, model, effort } = automation.ai;
  if (model === null && effort === null) {
    return { input };
  }
  const known = aiModelChoiceIssue({ runner, model, effort }) === null;
  return { input, runner, model: known ? model : null, effort: known ? effort : null };
};

const enqueue = async (
  factory: AiJobFactory,
  { userId, automation }: AutomationActionContext,
  input: AiJobInput,
): Promise<ActionEffect> => {
  await factory.enqueue(userId, jobBody(automation, input));
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

export class DraftReplyAutomationAction implements AutomationActionHandler {
  constructor(private readonly factory: AiJobFactory) {}

  run(context: AutomationActionContext): Promise<ActionEffect> {
    const { message, live } = context.arrival;
    if (!live) {
      return Promise.reject(
        new AutomationActionRefusal('Koncept odpovede sa pripravuje iba pre novo prijatý mail'),
      );
    }
    return enqueue(this.factory, context, {
      kind: 'automationDraft',
      threadId: message.threadId,
      messageId: message.id,
      automationId: context.automation.id,
      instructions: context.automation.ai.instructions,
    });
  }
}
