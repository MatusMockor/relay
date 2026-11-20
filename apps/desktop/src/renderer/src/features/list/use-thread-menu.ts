import type { FolderView } from '@relay/shared';
import type { AnchorRect } from '@relay/ui';
import type { MouseEvent } from 'react';
import { setUi } from '../../state/ui-store';
import { useContextMenu } from '../context-menu/use-context-menu';
import { actionView } from '../mail/action-view';
import type { ListItem } from '../mail/list-items';
import { useMailActions } from '../mail/MailActionsProvider';
import { selectKey } from '../mail/selection';
import { threadMenuItems } from './thread-menu-items';

export type ThreadListItem = Extract<ListItem, { kind: 'thread' }>;

const pointOf = (event: MouseEvent): AnchorRect => ({
  left: event.clientX,
  right: event.clientX,
  top: event.clientY,
  bottom: event.clientY,
});

export const useThreadMenu = () => {
  const showMenu = useContextMenu();
  const { thread: commands } = useMailActions();
  return (event: MouseEvent, item: ThreadListItem, view: FolderView) => {
    selectKey(item.key);
    const anchor = pointOf(event);
    const handlers: Readonly<Record<string, () => void>> = {
      read: () => {
        commands.markRead(item.thread);
      },
      unread: () => {
        commands.markUnread(item.thread);
      },
      done: () => {
        commands.markDone(item);
      },
      spam: () => {
        commands.toggleSpam(item);
      },
      trash: () => {
        commands.trash(item);
      },
      remind: () => {
        setUi({ overlay: { kind: 'remind', threadId: item.thread.id, anchor } });
      },
      rule: () => {
        setUi({ overlay: { kind: 'ruleFromMail', threadId: item.thread.id } });
      },
    };
    void showMenu(event, threadMenuItems(actionView(view, item), item.thread)).then((id) => {
      if (id === null) {
        return;
      }
      handlers[id]?.();
    });
  };
};
