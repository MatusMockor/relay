import { useEffect } from 'react';
import { listenForHistoryInputs } from './history-inputs';

export const useHistoryInputs = (): void => {
  useEffect(() => listenForHistoryInputs(window), []);
};
