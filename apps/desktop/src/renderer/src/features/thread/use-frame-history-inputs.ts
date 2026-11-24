import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { listenForSearchKeys } from '../search/frame-search-keys';
import { listenForHistoryInputs } from '../shell/history-inputs';

const listenForFrameInputs = (view: Window): (() => void) => {
  const stops = [listenForHistoryInputs(view), listenForSearchKeys(view)];
  return () => {
    stops.forEach((stop) => {
      stop();
    });
  };
};

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
    stop.current = view === null ? null : listenForFrameInputs(view);
  }, [ref]);
};
