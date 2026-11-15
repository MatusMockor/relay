import type { AiJobInput, AiOutputOf } from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptSpec } from '../prompt-spec';
import { threadSection } from '../thread-section';

export type CreateTaskInput = Extract<AiJobInput, { kind: 'createTask' }>;

export type CreateTaskOutput = AiOutputOf<'createTask'>;

const CreateTaskResponseSchema = z.strictObject({
  title: z.string().min(1).max(200),
  what: z.string().min(1).max(1_000),
});
type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;

const TASK: Localized<string> = {
  sk: 'Úloha: Z vlákna vytvor jednu úlohu pre používateľa. title je krátky názov v rozkazovacom spôsobe (najviac 10 slov), what sú 1 až 2 vety, čo presne treba urobiť a do kedy, ak je termín uvedený.',
  en: 'Task: Create one task for the user from the thread. title is a short imperative name (at most 10 words), what is 1 to 2 sentences saying what exactly has to be done and by when, if a deadline is given.',
};

const HINT: Localized<string> = { sk: 'Poznámka používateľa:', en: 'User note:' };

export const createTaskPrompt: PromptSpec<CreateTaskInput, CreateTaskResponse, CreateTaskOutput> = {
  kind: 'createTask',
  responseSchema: CreateTaskResponseSchema,
  tools: MAIL_READ_TOOLS,
  languageRule: 'output',
  task: (_input, context) => TASK[context.language],
  content: (input, context) => [
    threadSection(input.threadId, context),
    ...(input.hint === null ? [] : [`${HINT[context.language]} ${input.hint}`]),
  ],
  toOutput: (response, input) => ({
    kind: 'createTask',
    threadId: input.threadId,
    title: response.title,
    aiWhat: response.what,
  }),
};
