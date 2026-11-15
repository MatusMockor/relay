import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { wrapUntrusted } from '../untrusted-content';

type RewriteInput = Extract<AiJobInput, { kind: 'rewrite' }>;

const RewriteResponseSchema = z.strictObject({ text: z.string().min(1) });
type RewriteResponse = z.infer<typeof RewriteResponseSchema>;

const TASK: Localized<(instruction: string) => string> = {
  sk: (instruction) =>
    `Úloha: Prepíš koncept e-mailu podľa pokynu používateľa. Zachovaj význam a fakty a nevymýšľaj nové informácie.\nPokyn používateľa: ${instruction}`,
  en: (instruction) =>
    `Task: Rewrite the email draft according to the user's instruction. Keep the meaning and facts and do not invent new information.\nUser instruction: ${instruction}`,
};

const DRAFT_INTRO: Localized<string> = { sk: 'Koncept:', en: 'Draft:' };

export const rewritePrompt: PromptSpec<RewriteInput, RewriteResponse, AiOutputOf<'rewrite'>> = {
  kind: 'rewrite',
  responseSchema: RewriteResponseSchema,
  tools: [],
  languageRule: 'source',
  task: (input, context) => TASK[context.language](input.instruction),
  content: (input, context) => [
    `${DRAFT_INTRO[context.language]}\n${wrapUntrusted(input.text, context.nonce)}`,
  ],
  toOutput: (response) => ({ kind: 'rewrite', text: response.text }),
};
