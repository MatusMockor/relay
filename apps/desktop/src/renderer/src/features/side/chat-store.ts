import type { ThreadId } from '@relay/shared';
import { create } from 'zustand';

export type TurnStatus = 'running' | 'done' | 'error';

export interface ChatTurn {
  readonly id: number;
  readonly question: string;
  readonly steps: readonly string[];
  readonly answer: string;
  readonly references: readonly ThreadId[];
  readonly status: TurnStatus;
  readonly foot: string;
}

interface ChatState {
  readonly turns: readonly ChatTurn[];
  readonly queued: string | null;
  readonly draft: string;
  readonly ask: (question: string) => void;
}

export const useChat = create<ChatState>((set) => ({
  turns: [],
  queued: null,
  draft: '',
  ask: (question) => {
    set({ queued: question });
  },
}));

let sequence = 0;
const running = new Map<number, () => void>();

export const trackTurn = (id: number, stop: () => void): void => {
  running.set(id, stop);
};

export const resetChat = (): void => {
  running.forEach((stop) => {
    stop();
  });
  running.clear();
  useChat.setState({ turns: [], queued: null, draft: '' });
};

export const setChatDraft = (draft: string): void => {
  useChat.setState({ draft });
};

export const startTurn = (question: string): number => {
  sequence += 1;
  const id = sequence;
  useChat.setState((state) => ({
    queued: null,
    turns: [
      ...state.turns,
      { id, question, steps: [], answer: '', references: [], status: 'running', foot: '' },
    ],
  }));
  return id;
};

export const updateTurn = (id: number, patch: (turn: ChatTurn) => Partial<ChatTurn>): void => {
  if (!useChat.getState().turns.some((turn) => turn.id === id)) {
    return;
  }
  useChat.setState((state) => ({
    turns: state.turns.map((turn) => (turn.id === id ? { ...turn, ...patch(turn) } : turn)),
  }));
};
