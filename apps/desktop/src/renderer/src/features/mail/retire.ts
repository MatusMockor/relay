import { useUiStore } from '../../state/ui-store';
import type { ListItem } from './list-items';
import { backToList, openThread } from './navigation';
import { neighborOf, selectKey } from './selection';

export const retire = (items: readonly ListItem[], key: string): void => {
  const next = neighborOf(items, key);
  const open = useUiStore.getState().openThreadId;
  if (open === key) {
    if (next?.kind === 'thread') {
      openThread(next.thread.id);
      return;
    }
    backToList();
    return;
  }
  if (next !== null) {
    selectKey(next.key);
  }
};
