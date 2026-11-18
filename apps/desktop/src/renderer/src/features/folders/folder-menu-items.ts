import type { ContextMenuItem } from '@relay/shared';
import { FOLDER_COPY } from './edit/folder-copy';
import type { FolderTarget } from './edit/folder-edit-store';

const entry = (id: string, label: string): ContextMenuItem => ({
  type: 'item',
  id,
  label,
  enabled: true,
});

const editItems = (target: FolderTarget): ContextMenuItem[] => [
  { type: 'separator' },
  entry('create', FOLDER_COPY[target.kind].newChild),
  entry('rename', 'Premenovať'),
  entry('move', 'Presunúť do…'),
  entry('delete', 'Zmazať'),
];

export const folderMenuItems = (target: FolderTarget | null): ContextMenuItem[] => [
  entry('mark-all-read', 'Označiť všetko ako prečítané'),
  ...(target === null ? [] : editItems(target)),
];
