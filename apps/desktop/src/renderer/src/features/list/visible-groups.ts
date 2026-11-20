import type { VirtualItem } from '@tanstack/react-virtual';
import type { GroupSpan, ListLayout } from './list-entries';

export interface VisibleRow {
  readonly virtual: VirtualItem;
  readonly entry: Extract<ListLayout['entries'][number], { kind: 'row' }>;
}

export interface VisibleGroup {
  readonly span: GroupSpan;
  readonly rows: VisibleRow[];
}

export const visibleGroups = (items: readonly VirtualItem[], layout: ListLayout): VisibleGroup[] =>
  items.reduce<VisibleGroup[]>((groups, virtual) => {
    const entry = layout.entries[virtual.index];
    const span = entry === undefined ? undefined : layout.spans[entry.span];
    if (entry === undefined || span === undefined) {
      return groups;
    }
    const current = groups.at(-1)?.span === span ? groups.at(-1) : undefined;
    const group = current ?? { span, rows: [] };
    if (current === undefined) {
      groups.push(group);
    }
    if (entry.kind === 'row') {
      group.rows.push({ virtual, entry });
    }
    return groups;
  }, []);
