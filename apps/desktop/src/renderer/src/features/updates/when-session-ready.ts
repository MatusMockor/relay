import { type SessionState, useSessionStore } from '../../session/session-store';

const noop = (): void => undefined;

const runIfReady = (state: SessionState, action: () => void): void => {
  if (state.phase !== 'ready' || state.services === null) {
    return;
  }
  action();
};

export const whenSessionReady = (action: () => void): (() => void) => {
  const current = useSessionStore.getState();
  if (current.phase !== 'booting') {
    runIfReady(current, action);
    return noop;
  }
  const unsubscribe = useSessionStore.subscribe((state) => {
    if (state.phase === 'booting') {
      return;
    }
    unsubscribe();
    runIfReady(state, action);
  });
  return unsubscribe;
};
