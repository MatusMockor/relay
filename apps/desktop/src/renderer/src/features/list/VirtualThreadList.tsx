import { cx } from '@relay/ui';
import type { ListPaging } from '../../data/hooks/use-thread-list-paging';
import { dayGroupName } from '../../lib/day-groups';
import type { ListItem } from '../mail/list-items';
import { GroupHeader } from './GroupHeader';
import type { ListLayout } from './list-entries';
import { ListFooter } from './ListFooter';
import { ListRow } from './ListRow';
import type { RowContextOf } from './use-row-context';
import { useListVirtualizer } from './use-list-virtualizer';
import { visibleGroups } from './visible-groups';

export interface VirtualThreadListProps {
  readonly layout: ListLayout;
  readonly listKey: string;
  readonly rowHeight: number;
  readonly selectedKey: string | null;
  readonly revealKey: string | null;
  readonly paging: ListPaging;
  readonly now: Date;
  readonly contextOf: RowContextOf;
  readonly onOpen: (item: ListItem) => void;
}

export function VirtualThreadList(props: VirtualThreadListProps) {
  const { layout, selectedKey, paging, now, contextOf, onOpen } = props;
  const { scrollRef, virtualizer, items } = useListVirtualizer(props);
  const measured = virtualizer.measurementsCache;
  const setSize = paging.hasMore ? -1 : layout.rows;
  return (
    <div className="a-list" ref={scrollRef}>
      <div
        className="a-list-body"
        role="listbox"
        aria-label="Konverzácie"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {visibleGroups(items, layout).map(({ span, rows }) => {
          const top = measured[span.first]?.start ?? 0;
          const bottom = measured[span.last]?.end ?? top;
          return (
            <div
              key={span.key}
              className={cx('a-group', span.first === 0 && 'first')}
              role="group"
              aria-label={dayGroupName(span.group)}
              style={{ top, height: bottom - top }}
            >
              {span.header ? (
                <GroupHeader
                  group={span.group}
                  index={span.first}
                  measureRef={virtualizer.measureElement}
                />
              ) : null}
              {rows.map(({ virtual, entry }) => (
                <div
                  key={entry.key}
                  className="a-slot"
                  data-index={virtual.index}
                  ref={virtualizer.measureElement}
                  style={{ top: virtual.start - top }}
                >
                  <ListRow
                    item={entry.item}
                    selected={entry.key === selectedKey}
                    onOpen={onOpen}
                    context={contextOf(entry.item, now)}
                    position={{ index: entry.position, setSize }}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <ListFooter paging={paging} />
    </div>
  );
}
