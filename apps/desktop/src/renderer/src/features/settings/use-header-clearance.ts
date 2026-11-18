import { type RefObject, useEffect } from 'react';

const GAP = 8;

export const useHeaderClearance = (main: RefObject<HTMLElement | null>, view: string): void => {
  useEffect(() => {
    const host = main.current;
    const head = host?.querySelector<HTMLElement>('.sh-head') ?? null;
    if (host === null || head === null) {
      return undefined;
    }
    const apply = () => {
      host.style.scrollPaddingTop = `${head.offsetHeight + GAP}px`;
    };
    apply();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(apply);
    observer.observe(head);
    return () => {
      observer.disconnect();
    };
  }, [main, view]);
};
