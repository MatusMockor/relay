import { listenForHistoryButtons } from './history-buttons';
import { listenForHistoryKeys } from './history-keys';

export const listenForHistoryInputs = (target: Window): (() => void) => {
  const stopButtons = listenForHistoryButtons(target);
  const stopKeys = listenForHistoryKeys(target);
  return () => {
    stopButtons();
    stopKeys();
  };
};
