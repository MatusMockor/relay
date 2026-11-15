import type { AiJobInput, AiRunnerKind, ThreadId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { startTurn, trackTurn, updateTurn, useChat } from './chat-store';
import { reduceTurn } from './chat-turn-reducer';

export interface ChatRunOptions {
  readonly runner: AiRunnerKind;
  readonly runnerLabel: string;
  readonly threadId: ThreadId | null;
}

export const CREATE_TASK_QUESTION = 'Vytvor úlohu z tohto vlákna';

export const useChatRuns = ({ runner, runnerLabel, threadId }: ChatRunOptions) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const { turns } = useChat();
  const running = turns.some((turn) => turn.status === 'running');
  const start = (question: string, input: AiJobInput) => {
    const id = startTurn(question);
    const started = performance.now();
    const stop = client.runAi({ input, runner }, (event) => {
      updateTurn(id, reduceTurn(event, runnerLabel, started));
      if (event.type === 'completed' && event.output.kind === 'createTask') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
      }
    });
    trackTurn(id, stop);
  };
  const ask = (text: string): boolean => {
    const question = text.trim();
    if (question === '' || running) {
      return false;
    }
    const history = turns.flatMap((turn) =>
      turn.status === 'done'
        ? [
            { role: 'user' as const, text: turn.question },
            { role: 'assistant' as const, text: turn.answer },
          ]
        : [],
    );
    start(question, { kind: 'chatAnswer', question, threadId, history });
    return true;
  };
  const createTask = (hint: string): boolean => {
    if (threadId === null || running) {
      return false;
    }
    const trimmed = hint.trim();
    start(trimmed === '' ? CREATE_TASK_QUESTION : `${CREATE_TASK_QUESTION}: ${trimmed}`, {
      kind: 'createTask',
      threadId,
      hint: trimmed === '' ? null : trimmed.slice(0, 2_000),
    });
    return true;
  };
  return { running, ask, createTask };
};
