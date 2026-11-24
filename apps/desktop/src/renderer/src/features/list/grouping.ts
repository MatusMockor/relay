import type { FolderView, TaskPriority } from '@relay/shared';
import { describeWhen, listTimeLabel } from '../../lib/dates';
import { type DayGroup, dayGroupOf, sameDayGroup, threadTimeLabel } from '../../lib/day-groups';
import type { ListItem } from '../mail/list-items';
import { groupByPriorityOf } from '../tasks/priority-groups';
import type { PriorityOf } from '../tasks/thread-priorities';

const plainGroup = (label: string): DayGroup => ({ label, date: null });

export const groupOf = (item: ListItem, view: FolderView, now: Date): DayGroup => {
  if (item.kind === 'draft') {
    return plainGroup('Rozpísané');
  }
  if (item.kind === 'scheduled') {
    return plainGroup(describeWhen(new Date(item.scheduled.scheduledAt), now).group);
  }
  if (view === 'reminders' && item.thread.remindAt !== null) {
    return plainGroup(describeWhen(new Date(item.thread.remindAt), now).group);
  }
  return dayGroupOf(item.thread.lastMessageAt, now);
};

export const timeLabelOf = (item: ListItem, view: FolderView, now: Date): string => {
  if (item.kind === 'draft') {
    return listTimeLabel(item.draft.updatedAt, now);
  }
  if (item.kind === 'scheduled') {
    return describeWhen(new Date(item.scheduled.scheduledAt), now).short;
  }
  if (view === 'reminders' && item.thread.remindAt !== null) {
    return describeWhen(new Date(item.thread.remindAt), now).short;
  }
  return threadTimeLabel(item.thread.lastMessageAt, now);
};

export interface ListGroup extends DayGroup {
  readonly items: ListItem[];
  readonly priority?: TaskPriority;
}

export const groupByPriority = (items: readonly ListItem[], priorityOf: PriorityOf): ListGroup[] =>
  groupByPriorityOf(items, priorityOf).map((group) => ({ ...group, date: null }));

const groupByDay = (items: readonly ListItem[], view: FolderView, now: Date): ListGroup[] =>
  items.reduce<ListGroup[]>((groups, item) => {
    const group = groupOf(item, view, now);
    const last = groups.at(-1);
    if (last !== undefined && sameDayGroup(last, group)) {
      last.items.push(item);
      return groups;
    }
    groups.push({ ...group, items: [item] });
    return groups;
  }, []);

export const groupItems = (
  items: readonly ListItem[],
  view: FolderView,
  now: Date,
  priorityOf?: PriorityOf,
): ListGroup[] => {
  if (view === 'tasks' && priorityOf !== undefined) {
    return groupByPriority(items, priorityOf);
  }
  return groupByDay(items, view, now);
};
