import { IS_MAC } from '../../lib/platform-keys';
import { isTyping } from '../keyboard/key-handlers';
import type { HistoryDirection } from '../history/navigation-history';
import { stepHistory } from '../history/step-history';

const directionOf = (event: KeyboardEvent): HistoryDirection | null => {
  if (event.code === 'BracketLeft' || event.key === '[') {
    return 'back';
  }
  if (event.code === 'BracketRight' || event.key === ']') {
    return 'forward';
  }
  return null;
};

const onKeyDown = (event: KeyboardEvent): void => {
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  if (!mod || event.altKey || event.shiftKey || event.defaultPrevented || isTyping(event.target)) {
    return;
  }
  const direction = directionOf(event);
  if (direction === null) {
    return;
  }
  event.preventDefault();
  stepHistory(direction);
};

export const listenForHistoryKeys = (target: Window): (() => void) => {
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
};
