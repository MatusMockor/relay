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
  sk: 'Úloha: Napíš jeden krátky riadok (najviac 12 slov), ktorý rovno povie podstatu mailu: čo sa stalo alebo čo má používateľ urobiť, s konkrétnymi číslami, sumami, termínmi a názvami. Začni samotnou vecou. Nezačínaj odosielateľom ani slovami ako „Len informuje“, „Potvrdzuje“, „Pýta sa“ či „Posiela“. Bez bodky na konci. Príklady: „Objednávka 2646184332 zaplatená, 742,90 €“, „Review MR !412 potrebné ešte dnes“, „Stretnutie presunuté na štvrtok 14:00“.',
  en: 'Task: Write one short line (at most 12 words) that states the substance of the mail directly: what happened or what the user has to do, with concrete numbers, amounts, dates and names. Start with the thing itself. Do not start with the sender or with filler like "Just informs", "Confirms", "Asks" or "Sends". No trailing period. Examples: "Order 2646184332 paid, 742.90 €", "Review of MR !412 needed today", "Meeting moved to Thursday 14:00".',
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
