import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { listenForMouseBack } from '../shell/mouse-back';

export const useFrameMouseBack = (ref: RefObject<HTMLIFrameElement | null>): (() => void) => {
  const stop = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );
  return useCallback(() => {
    stop.current?.();
    const view = ref.current?.contentWindow ?? null;
    stop.current = view === null ? null : listenForMouseBack(view);
  }, [ref]);
};
