import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { threadSection } from '../thread-section';

type AutomationDraftInput = Extract<AiJobInput, { kind: 'automationDraft' }>;

const AutomationDraftResponseSchema = z.strictObject({
  body: z.string().min(1).max(4_000),
});
type AutomationDraftResponse = z.infer<typeof AutomationDraftResponseSchema>;

const TASK: Localized<string> = {
  sk: 'Úloha: Napíš návrh odpovede na posudzovanú správu, ktorý si používateľ pred odoslaním skontroluje. body je hotový text odpovede bez predmetu a bez podpisu, vecný a stručný (najviac 8 viet). Nesľubuj termíny, sumy ani fakty, ktoré vo vlákne nie sú, namiesto nich nechaj zátvorku [doplniť].',
  en: 'Task: Write a reply draft to the message under review that the user will check before sending. body is the ready reply text without a subject and without a signature, factual and short (at most 8 sentences). Do not promise dates, amounts or facts that are not in the thread, leave a [fill in] bracket instead.',
};

const TARGET: Localized<(messageId: string) => string> = {
  sk: (messageId) =>
    `Posudzovaná správa je správa s message_id ${messageId}. Ostatné správy vo vlákne ber iba ako kontext.`,
  en: (messageId) =>
    `The message under review is the message with message_id ${messageId}. Use the other messages in the thread only as context.`,
};

const INSTRUCTIONS: Localized<string> = {
  sk: 'Pokyny používateľa pre odpoveď (majú prednosť):',
  en: 'User instructions for the reply (they take precedence):',
};

export const automationDraftPrompt: PromptSpec<
  AutomationDraftInput,
  AutomationDraftResponse,
  AiOutputOf<'automationDraft'>
> = {
  kind: 'automationDraft',
  responseSchema: AutomationDraftResponseSchema,
  tools: MAIL_READ_TOOLS,
  languageRule: 'source',
  task: (_input, context) => TASK[context.language],
  content: (input, context) => [
    TARGET[context.language](input.messageId),
    ...(input.instructions === null
      ? []
      : [`${INSTRUCTIONS[context.language]} ${input.instructions}`]),
    threadSection(input.threadId, context),
  ],
  toOutput: (response, input) => ({
    kind: 'automationDraft',
    threadId: input.threadId,
    messageId: input.messageId,
    body: response.body.trim(),
  }),
};
