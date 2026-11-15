import type { AiEvent, AiJobInput, AiOutput } from '@relay/shared';
import type { AiEventListener, Unsubscribe } from '../MailClient';
import type { DemoState } from './demo-state';
import { truncate } from '../../lib/text';
import { demoRewrite } from './demo-rewrite';

const TASK_TITLE_MAX = 500;

const answerChat = (state: DemoState, question: string, threadId: string | null): string => {
  const record = threadId === null ? undefined : state.threads.get(threadId);
  if (record !== undefined && /zhr|o com|čo chce|co chce/i.test(question)) {
    return record.aiSummary ?? record.summary.aiOneLiner ?? record.summary.snippet;
  }
  const urgent = [...state.threads.values()]
    .filter(
      (item) =>
        item.summary.state === 'inbox' && item.summary.unread && item.summary.splitIds.length === 0,
    )
    .slice(0, 4)
    .map(
      (item, index) => `${String(index + 1)}. ${item.summary.aiOneLiner ?? item.summary.subject}`,
    );
  if (urgent.length === 0) {
    return 'Dnes už nič nečaká. Pekný zvyšok dňa.';
  }
  return `Dnes ťa čaká:\n${urgent.join('\n')}`;
};

const outputFor = (state: DemoState, input: AiJobInput): AiOutput => {
  if (input.kind === 'rewrite') {
    return { kind: 'rewrite', text: demoRewrite(input.text, input.instruction) };
  }
  if (input.kind === 'chatAnswer') {
    return {
      kind: 'chatAnswer',
      text: answerChat(state, input.question, input.threadId),
      references: input.threadId === null ? [] : [input.threadId],
    };
  }
  const record = state.threads.get(input.threadId);
  if (input.kind === 'createTask') {
    return {
      kind: 'createTask',
      threadId: input.threadId,
      title: truncate(input.hint ?? record?.summary.subject ?? 'Úloha z pošty', TASK_TITLE_MAX),
      aiWhat: record?.aiSummary ?? record?.summary.snippet ?? 'Vybaviť podľa vlákna.',
    };
  }
  if (input.kind === 'summary') {
    return {
      kind: 'summary',
      summary: record?.aiSummary ?? 'Bez zhrnutia.',
      checklist: record?.checklist ?? [],
    };
  }
  if (input.kind === 'replySuggestions') {
    return { kind: 'replySuggestions', suggestions: record?.replySuggestions ?? [] };
  }
  return {
    kind: 'oneLiner',
    text: record?.summary.aiOneLiner ?? record?.summary.subject ?? 'Bez zhrnutia',
  };
};

const textOf = (output: AiOutput): string => {
  if (output.kind === 'summary') {
    return output.summary;
  }
  if (output.kind === 'replySuggestions') {
    return output.suggestions.map((item) => item.label).join(', ');
  }
  if (output.kind === 'createTask') {
    return output.title;
  }
  return output.text;
};

export const runDemoAi = (
  state: DemoState,
  input: AiJobInput,
  listener: AiEventListener,
  stepMs: number,
): Unsubscribe => {
  const output = outputFor(state, input);
  const words = textOf(output).split(/(\s+)/);
  const chunks = Array.from({ length: Math.ceil(words.length / 6) }, (_, index) =>
    words.slice(index * 6, index * 6 + 6).join(''),
  );
  const events: AiEvent[] = [
    { type: 'started', runner: state.settings.ai.defaultRunner },
    { type: 'toolCall', name: 'search_mail' },
    ...chunks.map((text): AiEvent => ({ type: 'delta', text })),
    { type: 'completed', output },
  ];
  const timers = events.map((event, index) =>
    setTimeout(() => {
      listener(event);
    }, stepMs * index),
  );
  return () => {
    timers.forEach(clearTimeout);
  };
};
