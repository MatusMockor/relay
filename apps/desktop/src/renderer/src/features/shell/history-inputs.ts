import { listenForHistoryButtons } from './history-buttons';
import { listenForHistoryKeys } from './history-keys';
import { listenForSwipeWheel } from './trackpad-swipe';

export const listenForHistoryInputs = (target: Window): (() => void) => {
  const stops = [
    listenForHistoryButtons(target),
    listenForHistoryKeys(target),
    listenForSwipeWheel(target),
  ];
  return () => {
    stops.forEach((stop) => {
      stop();
    });
  };
};
