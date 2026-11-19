import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { listenForHistoryInputs } from '../shell/history-inputs';

export const useFrameHistoryInputs = (ref: RefObject<HTMLIFrameElement | null>): (() => void) => {
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
    stop.current = view === null ? null : listenForHistoryInputs(view);
  }, [ref]);
};
