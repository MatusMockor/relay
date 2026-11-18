import { useEffect } from 'react';
import { listenForMouseBack } from './mouse-back';

export const useMouseBack = (): void => {
  useEffect(() => listenForMouseBack(window), []);
};
