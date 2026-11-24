import { FolderIcon } from '@relay/ui';
import {
  type Folder,
  NAV_VIEWS,
  type NavView,
  usesThreadList,
  VIEW_META,
} from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { selectFolder } from '../mail/navigation';
import { folderIconOf } from './folder-icons';
import { useFolderCounts } from './use-folder-counts';
import { useFolderMenu } from './use-folder-menu';

const isOn = (folder: Folder, view: NavView): boolean => {
  if (view === 'inbox') {
    return folder.kind === 'inbox';
  }
  return folder.kind === 'view' && folder.view === view;
};

const folderFor = (view: NavView): Folder =>
  view === 'inbox' ? { kind: 'inbox', splitId: null } : { kind: 'view', view };

export function SystemFolders() {
  const folder = useUiStore((state) => state.folder);
  const counts = useFolderCounts();
  const showMenu = useFolderMenu();
  return (
    <>
      {NAV_VIEWS.map((view) => {
        const meta = VIEW_META[view];
        const count = counts[view] ?? 0;
        const entry = folderFor(view);
        return (
          <button
            key={view}
            type="button"
            className={`f${isOn(folder, view) ? ' on' : ''}`}
            title={`${meta.sub ?? meta.label} (G ${meta.g})`}
            aria-current={isOn(folder, view) ? 'page' : undefined}
            onClick={() => {
              selectFolder(entry);
            }}
            onContextMenu={
              usesThreadList(entry)
                ? (event) => {
                    showMenu(event, entry, null);
                  }
                : undefined
            }
          >
            <FolderIcon name={folderIconOf(view)} />
            <span className="fl">{meta.label}</span>
            {count > 0 ? <span className="n">{count}</span> : null}
          </button>
        );
      })}
    </>
  );
}
