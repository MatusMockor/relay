import type { FolderView } from '@relay/shared';
import type { FolderIconName } from '@relay/ui';
import { VIEW_META } from '../../state/folders';

const ICONS = {
  inbox: 'inbox',
  task: 'task',
  clock: 'clock',
  check: 'check',
  send: 'send',
  file: 'file',
  calendar: 'calendar',
  trash: 'trash',
} as const satisfies Record<string, FolderIconName>;

export const folderIconOf = (view: FolderView): FolderIconName => ICONS[VIEW_META[view].icon];
