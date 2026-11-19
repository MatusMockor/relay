import type { AnchorRect } from '@relay/ui';
import type { MouseEvent } from 'react';
import type { Folder } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useContextMenu } from '../context-menu/use-context-menu';
import { type FolderEdit, type FolderTarget, setFolderEdit } from './edit/folder-edit-store';
import { folderMenuItems } from './folder-menu-items';
import { useMarkFolderRead } from './use-mark-folder-read';

const pointOf = (event: MouseEvent): AnchorRect => ({
  left: event.clientX,
  right: event.clientX,
  top: event.clientY,
  bottom: event.clientY,
});

const editsOf = (
  target: FolderTarget,
  anchor: AnchorRect,
): Readonly<Record<string, FolderEdit>> => ({
  create: { kind: 'create', accountId: target.mailbox.accountId, parent: target },
  rename: { kind: 'rename', target },
  move: { kind: 'move', target, anchor },
  delete: { kind: 'delete', target },
});

export type ShowFolderMenu = (
  event: MouseEvent,
  folder: Folder,
  target: FolderTarget | null,
) => void;

export const useFolderMenu = (): ShowFolderMenu => {
  const showMenu = useContextMenu();
  const markRead = useMarkFolderRead();
  return (event, folder, target) => {
    const anchor = pointOf(event);
    const { scope } = useUiStore.getState();
    void showMenu(event, folderMenuItems(target)).then((id) => {
      if (id === 'mark-all-read') {
        void markRead(folder, scope);
        return;
      }
      if (id === null || target === null) {
        return;
      }
      const edit = editsOf(target, anchor)[id];
      if (edit !== undefined) {
        setFolderEdit(edit);
      }
    });
  };
};
