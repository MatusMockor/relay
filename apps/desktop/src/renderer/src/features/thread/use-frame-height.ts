import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { measureMailFrame } from './measure-mail-frame';

const INITIAL_HEIGHT = 160;

export function useFrameHeight(ref: RefObject<HTMLIFrameElement | null>) {
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(
    () => () => {
      observer.current?.disconnect();
    },
    [],
  );

  const onLoad = useCallback(() => {
    const frame = ref.current;
    const document = frame?.contentDocument;
    observer.current?.disconnect();
    observer.current = null;
    if (frame === null || document === null || document === undefined) {
      return;
    }
    const measure = () => {
      setHeight(measureMailFrame(frame, document));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    observer.current = new ResizeObserver(measure);
    observer.current.observe(document.body);
  }, [ref]);

  return { height, onLoad };
}
