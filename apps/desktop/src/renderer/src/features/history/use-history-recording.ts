import { useEffect } from 'react';
import { appHistory } from './app-history';

export const useHistoryRecording = (): void => {
  useEffect(() => appHistory.start(), []);
};
