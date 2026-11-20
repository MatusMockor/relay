import type { Virtualizer } from '@tanstack/react-virtual';
import { useCallback, useRef } from 'react';
import type { ListLayout } from './list-entries';

export type ListVirtualizer = Virtualizer<HTMLDivElement, Element>;

interface Anchor {
  readonly key: string;
  readonly delta: number;
  readonly offset: number;
}

const anchorOf = (instance: ListVirtualizer, offset: number): Anchor | null => {
  if (offset <= 0) {
    return null;
  }
  const item = instance.getVirtualItems().find((entry) => entry.end > offset);
  if (item === undefined) {
    return null;
  }
  return { key: String(item.key), delta: offset - item.start, offset };
};

export const useScrollAnchor = () => {
  const anchor = useRef<Anchor | null>(null);
  const track = useCallback((instance: ListVirtualizer) => {
    const offset = instance.scrollOffset ?? 0;
    if (anchor.current?.offset === offset) {
      return;
    }
    anchor.current = anchorOf(instance, offset);
  }, []);
  const restore = useCallback((virtualizer: ListVirtualizer, layout: ListLayout) => {
    const current = anchor.current;
    const index = current === null ? undefined : layout.indexOf.get(current.key);
    const item = index === undefined ? undefined : virtualizer.measurementsCache[index];
    if (current === null || item === undefined) {
      return;
    }
    const target = item.start + current.delta;
    if (Math.abs(target - current.offset) < 1) {
      return;
    }
    virtualizer.scrollToOffset(target);
  }, []);
  return { track, restore };
};
