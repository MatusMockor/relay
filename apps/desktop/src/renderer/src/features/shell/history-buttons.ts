import type { HistoryDirection } from '../history/navigation-history';
import { pressHistory } from '../history/step-history';

const BUTTONS: Readonly<Record<number, HistoryDirection>> = { 3: 'back', 4: 'forward' };

const directionOf = (event: MouseEvent): HistoryDirection | undefined => BUTTONS[event.button];

const suppress = (event: MouseEvent): void => {
  if (directionOf(event) === undefined) {
    return;
  }
  event.preventDefault();
};

const onMouseUp = (event: MouseEvent): void => {
  const direction = directionOf(event);
  if (direction === undefined) {
    return;
  }
  event.preventDefault();
  pressHistory(direction, 'pointer');
};

export const listenForHistoryButtons = (target: Window): (() => void) => {
  target.addEventListener('mousedown', suppress);
  target.addEventListener('auxclick', suppress);
  target.addEventListener('mouseup', onMouseUp);
  return () => {
    target.removeEventListener('mousedown', suppress);
    target.removeEventListener('auxclick', suppress);
    target.removeEventListener('mouseup', onMouseUp);
  };
};
