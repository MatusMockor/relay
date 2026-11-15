import type { FolderView } from '@relay/shared';
import { dayGroupOf, describeWhen, listTimeLabel } from '../../lib/dates';
import type { ListItem } from '../mail/list-items';

export const groupLabelOf = (item: ListItem, view: FolderView, now: Date): string => {
  if (item.kind === 'draft') {
    return 'Rozpísané';
  }
  if (item.kind === 'scheduled') {
    return describeWhen(new Date(item.scheduled.scheduledAt), now).group;
  }
  if (view === 'reminders' && item.thread.remindAt !== null) {
    return describeWhen(new Date(item.thread.remindAt), now).group;
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
  return listTimeLabel(item.thread.lastMessageAt, now);
};

export interface ListGroup {
  readonly label: string;
  readonly items: ListItem[];
}

export const groupItems = (items: readonly ListItem[], view: FolderView, now: Date): ListGroup[] =>
  items.reduce<ListGroup[]>((groups, item) => {
    const label = groupLabelOf(item, view, now);
    const last = groups.at(-1);
    if (last?.label === label) {
      last.items.push(item);
      return groups;
    }
    groups.push({ label, items: [item] });
    return groups;
  }, []);
