import type { AiEvent, AiOutput } from '@relay/shared';
import type { ChatTurn } from './chat-store';

const TOOL_LABEL: Readonly<Record<string, string>> = {
  search_mail: 'Hľadám v pošte…',
  search_threads: 'Hľadám v pošte…',
  get_thread: 'Čítam vlákno…',
  list_folder: 'Prechádzam priečinok…',
  list_tasks: 'Pozerám úlohy…',
  list_events: 'Pozerám kalendár…',
  get_thread_events: 'Pozerám udalosť vo vlákne…',
  create_task: 'Vytváram úlohu…',
  create_draft: 'Pripravujem koncept…',
};

const completedTurn = (output: AiOutput, turn: ChatTurn): Partial<ChatTurn> => {
  if (output.kind === 'chatAnswer') {
    return { answer: output.text, references: output.references };
  }
  if (output.kind === 'createTask') {
    return {
      answer: `Úloha vytvorená: ${output.title}\n${output.aiWhat}`,
      references: [output.threadId],
    };
  }
  if (output.kind === 'rewrite' || output.kind === 'oneLiner') {
    return { answer: output.text };
  }
  return { answer: turn.answer };
};

export const reduceTurn =
  (event: AiEvent, runnerLabel: string, started: number) =>
  (turn: ChatTurn): Partial<ChatTurn> => {
    if (event.type === 'started') {
      return { steps: [...turn.steps, `Spúšťam ${runnerLabel}`] };
    }
    if (event.type === 'toolCall') {
      return { steps: [...turn.steps, TOOL_LABEL[event.name] ?? event.name] };
    }
    if (event.type === 'delta') {
      return { answer: turn.answer + event.text };
    }
    const seconds = ((performance.now() - started) / 1000).toFixed(1).replace('.', ',');
    const foot = `${runnerLabel} · ${seconds} s`;
    if (event.type === 'failed') {
      return { status: 'error', answer: event.message, foot };
    }
    return { ...completedTurn(event.output, turn), status: 'done', foot };
  };
