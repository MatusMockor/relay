import {
  ThreadIdSchema,
  type AiJobInput,
  type AiOutputOf,
  type ChatTurn,
} from '@relay/shared/domain';
import { z } from 'zod';
import { MAIL_READ_TOOLS, MAIL_WRITE_TOOLS } from '../mail-tools';
import type { Localized } from '../prompt-language';
import type { PromptContext, PromptSpec } from '../prompt-spec';
import { mergeReferences } from '../thread-references';
import { threadSection } from '../thread-section';
import { wrapUntrusted } from '../untrusted-content';

type ChatAnswerInput = Extract<AiJobInput, { kind: 'chatAnswer' }>;

export const ChatAnswerResponseSchema = z.strictObject({
  text: z.string().min(1).max(8_000),
  threadIds: z.array(ThreadIdSchema).max(20),
});
export type ChatAnswerResponse = z.infer<typeof ChatAnswerResponseSchema>;

interface ChatTexts {
  readonly task: string;
  readonly history: string;
  readonly user: string;
  readonly assistant: string;
  readonly question: string;
}

const TEXTS: Localized<ChatTexts> = {
  sk: {
    task: 'Úloha: Odpovedz na otázku používateľa o jeho pošte. Ak potrebuješ údaje, použi nástroje search_threads, list_folder, get_thread a list_tasks, na otázky o kalendári list_events a get_thread_events. Časy z kalendára uvádzaj v časovom pásme, ktoré nástroj vráti. Koncept (create_draft) alebo úlohu (create_task) vytvor iba vtedy, keď o to používateľ výslovne žiada. Ak sa odpoveď opiera o konkrétne vlákna, uveď ich ID v poli threadIds a v texte na ne odkazuj značkou [thread:ID]. Ak odpoveď nepoznáš, povedz to.',
    history: 'Doterajšia konverzácia:',
    user: 'Používateľ',
    assistant: 'Asistent',
    question: 'Otázka používateľa:',
  },
  en: {
    task: 'Task: Answer the user question about their mail. Use the search_threads, list_folder, get_thread and list_tasks tools when you need data, and list_events and get_thread_events for calendar questions. State calendar times in the time zone the tool returns. Create a draft (create_draft) or a task (create_task) only when the user explicitly asks for it. When the answer relies on specific threads, list their ids in threadIds and refer to them in the text with the marker [thread:ID]. If you do not know the answer, say so.',
    history: 'Conversation so far:',
    user: 'User',
    assistant: 'Assistant',
    question: 'User question:',
  },
};

function renderHistory(history: readonly ChatTurn[], context: PromptContext): string[] {
  if (history.length === 0) {
    return [];
  }
  const texts = TEXTS[context.language];
  const turns = history.map((turn) => {
    if (turn.role === 'user') {
      return `${texts.user}: ${turn.text}`;
    }
    return `${texts.assistant}:\n${wrapUntrusted(turn.text, context.nonce)}`;
  });
  return [`${texts.history}\n${turns.join('\n')}`];
}

export const chatAnswerPrompt: PromptSpec<
  ChatAnswerInput,
  ChatAnswerResponse,
  AiOutputOf<'chatAnswer'>
> = {
  kind: 'chatAnswer',
  responseSchema: ChatAnswerResponseSchema,
  tools: [...MAIL_READ_TOOLS, ...MAIL_WRITE_TOOLS],
  languageRule: 'output',
  task: (_input, context) => TEXTS[context.language].task,
  content: (input, context) => [
    ...(input.threadId === null ? [] : [threadSection(input.threadId, context)]),
    ...renderHistory(input.history, context),
    `${TEXTS[context.language].question} ${input.question}`,
  ],
  toOutput: (response) => ({
    kind: 'chatAnswer',
    text: response.text,
    references: mergeReferences(response.threadIds, response.text),
  }),
};
