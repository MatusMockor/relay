import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { threadSection } from '../thread-section';

type SummaryInput = Extract<AiJobInput, { kind: 'summary' }>;

const SummaryResponseSchema = z.strictObject({
  summary: z.string().min(1).max(1_200),
  checklist: z.array(z.string().min(1).max(300)).max(8),
});
type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

const TASK: Localized<string> = {
  sk: 'Úloha: Zhrň vlákno v 2 až 3 vetách. Potom vytvor kontrolný zoznam konkrétnych krokov, ktoré musí urobiť používateľ (najviac 8 položiek, zoznam môže byť prázdny).',
  en: 'Task: Summarise the thread in 2 to 3 sentences. Then create a checklist of concrete steps the user has to take (at most 8 items, the list may be empty).',
};

export const summaryPrompt: PromptSpec<SummaryInput, SummaryResponse, AiOutputOf<'summary'>> = {
  kind: 'summary',
  responseSchema: SummaryResponseSchema,
  tools: MAIL_READ_TOOLS,
  languageRule: 'output',
  task: (_input, context) => TASK[context.language],
  content: (input, context) => [threadSection(input.threadId, context)],
  toOutput: (response) => ({
    kind: 'summary',
    summary: response.summary,
    checklist: response.checklist.map((text, index) => ({
      id: `check-${index + 1}`,
      text,
      done: false,
    })),
  }),
};
