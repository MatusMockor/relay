import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { threadSection } from '../thread-section';

type ReplySuggestionsInput = Extract<AiJobInput, { kind: 'replySuggestions' }>;

const ReplySuggestionsResponseSchema = z.strictObject({
  suggestions: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(60),
        body: z.string().min(1).max(2_000),
      }),
    )
    .length(3),
});
type ReplySuggestionsResponse = z.infer<typeof ReplySuggestionsResponseSchema>;

const TASK: Localized<string> = {
  sk: 'Úloha: Navrhni presne 3 rôzne krátke odpovede, ktoré môže používateľ poslať na poslednú správu vo vlákne. label má 2 až 4 slová, body je hotový text odpovede (1 až 3 vety) bez podpisu.',
  en: 'Task: Suggest exactly 3 different short replies the user can send to the last message in the thread. label has 2 to 4 words, body is the ready reply text (1 to 3 sentences) without a signature.',
};

export const replySuggestionsPrompt: PromptSpec<
  ReplySuggestionsInput,
  ReplySuggestionsResponse,
  AiOutputOf<'replySuggestions'>
> = {
  kind: 'replySuggestions',
  responseSchema: ReplySuggestionsResponseSchema,
  tools: MAIL_READ_TOOLS,
  languageRule: 'source',
  task: (_input, context) => TASK[context.language],
  content: (input, context) => [threadSection(input.threadId, context)],
  toOutput: (response) => ({
    kind: 'replySuggestions',
    suggestions: response.suggestions.map((suggestion, index) => ({
      id: `reply-${index + 1}`,
      label: suggestion.label,
      body: suggestion.body,
    })),
  }),
};
