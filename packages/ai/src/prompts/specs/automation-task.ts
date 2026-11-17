import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { threadSection } from '../thread-section';

export type AutomationTaskInput = Extract<AiJobInput, { kind: 'automationTask' }>;

const AutomationTaskResponseSchema = z.strictObject({
  actionable: z.boolean(),
  title: z.string().max(200),
  what: z.string().max(1_000),
});
type AutomationTaskResponse = z.infer<typeof AutomationTaskResponseSchema>;

const TASK: Localized<string> = {
  sk: 'Úloha: Posúď, či najnovšia správa vo vlákne vyžaduje od používateľa nejakú akciu (odpoveď, rozhodnutie, prácu alebo termín). Ak áno, nastav actionable na true, title je krátky názov úlohy v rozkazovacom spôsobe (najviac 10 slov) a what sú 1 až 2 vety, čo presne treba urobiť a do kedy, ak je termín uvedený. Ak správa je len informatívna, nastav actionable na false a title aj what nechaj prázdne.',
  en: 'Task: Decide whether the latest message in the thread needs an action from the user (a reply, a decision, work or a deadline). If it does, set actionable to true, title is a short imperative task name (at most 10 words) and what is 1 to 2 sentences saying what exactly has to be done and by when, if a deadline is given. If the message is only informational, set actionable to false and leave title and what empty.',
};

const INSTRUCTIONS: Localized<string> = {
  sk: 'Pravidlá používateľa pre toto posúdenie (majú prednosť):',
  en: 'User rules for this decision (they take precedence):',
};

const JIRA: Localized<(key: string) => string> = {
  sk: (key) => `Vlákno patrí k Jira úlohe ${key}.`,
  en: (key) => `The thread belongs to the Jira issue ${key}.`,
};

export const automationTaskPrompt: PromptSpec<
  AutomationTaskInput,
  AutomationTaskResponse,
  AiOutputOf<'automationTask'>
> = {
  kind: 'automationTask',
  responseSchema: AutomationTaskResponseSchema,
  tools: MAIL_READ_TOOLS,
  languageRule: 'output',
  task: (_input, context) => TASK[context.language],
  content: (input, context) => [
    ...(input.instructions === null
      ? []
      : [`${INSTRUCTIONS[context.language]} ${input.instructions}`]),
    ...(input.jiraKey === null ? [] : [JIRA[context.language](input.jiraKey)]),
    threadSection(input.threadId, context),
  ],
  toOutput: (response, input) => ({
    kind: 'automationTask',
    threadId: input.threadId,
    actionable: response.actionable && response.title.trim() !== '',
    title: response.actionable ? response.title.trim() : '',
    description: response.actionable ? response.what.trim() : '',
  }),
};
