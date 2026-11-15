import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { threadSection } from '../thread-section';

type OneLinerInput = Extract<AiJobInput, { kind: 'oneLiner' }>;

const OneLinerResponseSchema = z.strictObject({ text: z.string().min(1).max(240) });
type OneLinerResponse = z.infer<typeof OneLinerResponseSchema>;

const TASK: Localized<string> = {
  sk: 'Úloha: Napíš jednu krátku vetu (najviac 20 slov), čo odosielateľ chce od používateľa. Ak nič nechce, napíš to stručne, napríklad „Len informuje o ...“.',
  en: 'Task: Write one short sentence (at most 20 words) saying what the sender wants from the user. If they want nothing, say so briefly, for example "Just informs about ...".',
};

export const oneLinerPrompt: PromptSpec<OneLinerInput, OneLinerResponse, AiOutputOf<'oneLiner'>> = {
  kind: 'oneLiner',
  responseSchema: OneLinerResponseSchema,
  tools: MAIL_READ_TOOLS,
  languageRule: 'output',
  task: (_input, context) => TASK[context.language],
  content: (input, context) => [threadSection(input.threadId, context)],
  toOutput: (response) => ({ kind: 'oneLiner', text: response.text }),
};
