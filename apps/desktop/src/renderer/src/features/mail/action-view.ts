import type { FolderView } from '@relay/shared';
import type { ListItem } from './list-items';

const HELD_VIEWS: readonly FolderView[] = ['trash', 'spam'];
const MIXED_VIEWS: readonly FolderView[] = ['mailbox', 'label'];

export const actionView = (view: FolderView, item: ListItem): string => {
  if (item.kind !== 'thread') {
    return view;
  }
  if (MIXED_VIEWS.includes(view)) {
    return item.thread.state;
  }
  return HELD_VIEWS.includes(view) && item.thread.state !== view ? item.thread.state : view;
};
