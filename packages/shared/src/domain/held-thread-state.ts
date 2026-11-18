import type { ThreadState } from './thread';

export type HeldThreadState = Extract<ThreadState, 'trash' | 'spam'>;

export const HELD_THREAD_STATES: readonly HeldThreadState[] = ['trash', 'spam'];

export const isHeldThreadState = (state: ThreadState): state is HeldThreadState =>
  HELD_THREAD_STATES.some((held) => held === state);
