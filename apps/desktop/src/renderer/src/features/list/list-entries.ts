import type { FolderView } from '@relay/shared';
import { hasDayHeader } from '../../lib/day-groups';
import type { ListItem } from '../mail/list-items';
import type { PriorityOf } from '../tasks/thread-priorities';
import { groupItems, type ListGroup } from './grouping';

export type ListEntry =
  | { readonly kind: 'header'; readonly key: string; readonly span: number }
  | {
      readonly kind: 'row';
      readonly key: string;
      readonly span: number;
      readonly item: ListItem;
      readonly position: number;
    };

export interface GroupSpan {
  readonly key: string;
  readonly group: ListGroup;
  readonly first: number;
  readonly last: number;
  readonly header: boolean;
}

export interface ListLayout {
  readonly entries: readonly ListEntry[];
  readonly spans: readonly GroupSpan[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly rows: number;
}

export const buildListLayout = (
  items: readonly ListItem[],
  view: FolderView,
  now: Date,
  priorityOf?: PriorityOf,
): ListLayout => {
  const entries: ListEntry[] = [];
  const spans: GroupSpan[] = [];
  const indexOf = new Map<string, number>();
  let position = 0;
  groupItems(items, view, now, priorityOf).forEach((group, span) => {
    const key = `group:${group.items[0]?.key ?? group.label}`;
    const header = hasDayHeader(group);
    const first = entries.length;
    if (header) {
      indexOf.set(key, entries.length);
      entries.push({ kind: 'header', key, span });
    }
    group.items.forEach((item) => {
      indexOf.set(item.key, entries.length);
      entries.push({ kind: 'row', key: item.key, span, item, position });
      position += 1;
    });
    spans.push({ key, group, first, last: entries.length - 1, header });
  });
  return { entries, spans, indexOf, rows: position };
};
