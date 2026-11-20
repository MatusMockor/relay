import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ListPaging } from '../../data/hooks/use-thread-list-paging';
import type { ListLayout } from './list-entries';
import { rememberedOffset, rememberOffset } from './scroll-memory';
import { useScrollAnchor } from './use-scroll-anchor';

export const ROW_HEIGHT = { normal: 44, compact: 36 } as const;
const HEADER_ESTIMATE = 34;
const FIRST_GROUP_PADDING = 8;
const SCROLL_PADDING = 40;
const OVERSCAN = 8;
const LOAD_AHEAD = 60;

export interface ListVirtualizerInput {
  readonly layout: ListLayout;
  readonly listKey: string;
  readonly rowHeight: number;
  readonly revealKey: string | null;
  readonly paging: ListPaging;
}

export const useListVirtualizer = ({
  layout,
  listKey,
  rowHeight,
  revealKey,
  paging,
}: ListVirtualizerInput) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const getItemKey = useCallback(
    (index: number) => layout.entries[index]?.key ?? String(index),
    [layout],
  );
  const estimateSize = useCallback(
    (index: number) => (layout.entries[index]?.kind === 'header' ? HEADER_ESTIMATE : rowHeight),
    [layout, rowHeight],
  );
  const anchor = useScrollAnchor();
  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: layout.entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN,
    paddingStart: layout.spans[0]?.header === false ? FIRST_GROUP_PADDING : 0,
    scrollPaddingStart: SCROLL_PADDING,
    initialOffset: () => rememberedOffset(listKey),
    onChange: (instance) => {
      rememberOffset(listKey, instance.scrollOffset ?? 0);
      anchor.track(instance);
    },
  });
  const { restore } = anchor;
  useLayoutEffect(() => {
    restore(virtualizer, layout);
  }, [layout, restore, virtualizer]);
  useEffect(() => {
    const index = revealKey === null ? undefined : layoutRef.current.indexOf.get(revealKey);
    if (index === undefined) {
      return;
    }
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [revealKey, virtualizer]);
  const items = virtualizer.getVirtualItems();
  const last = items.at(-1)?.index ?? -1;
  useEffect(() => {
    if (!paging.hasMore || paging.loadingMore || last < layout.entries.length - LOAD_AHEAD) {
      return;
    }
    paging.loadMore();
  }, [last, layout.entries.length, paging]);
  return { scrollRef, virtualizer, items };
};
