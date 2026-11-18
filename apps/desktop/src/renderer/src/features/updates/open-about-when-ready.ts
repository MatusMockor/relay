import { type SessionState, useSessionStore } from '../../session/session-store';
import { openAboutUnlessBusy } from './open-about';

const noop = (): void => undefined;

const openIfReady = (state: SessionState): void => {
  if (state.phase !== 'ready' || state.services === null) {
    return;
  }
  openAboutUnlessBusy();
};

export const openAboutWhenReady = (): (() => void) => {
  const current = useSessionStore.getState();
  if (current.phase !== 'booting') {
    openIfReady(current);
    return noop;
  }
  const unsubscribe = useSessionStore.subscribe((state) => {
    if (state.phase === 'booting') {
      return;
    }
    unsubscribe();
    openIfReady(state);
  });
  return unsubscribe;
};
