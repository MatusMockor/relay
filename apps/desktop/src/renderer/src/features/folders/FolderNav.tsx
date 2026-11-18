import type { FolderView, Label } from '@relay/shared';
import { FolderIcon } from '@relay/ui';
import { type Folder, NAV_VIEWS, VIEW_META } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { selectFolder } from '../mail/navigation';
import { folderIconOf } from './folder-icons';
import { useNameColors } from '../colors/use-name-colors';
import { useFolderCounts } from './use-folder-counts';

const isOn = (folder: Folder, view: FolderView): boolean => {
  if (view === 'inbox') {
    return folder.kind === 'inbox';
  }
  return folder.kind === 'view' && folder.view === view;
};

const folderFor = (view: FolderView): Folder =>
  view === 'inbox' ? { kind: 'inbox', splitId: null } : { kind: 'view', view };

export function FolderNav({
  labels,
  showTasks,
}: {
  readonly labels: readonly Label[];
  readonly showTasks: boolean;
}) {
  const folder = useUiStore((state) => state.folder);
  const counts = useFolderCounts();
  const colors = useNameColors();
  return (
    <>
      {NAV_VIEWS.filter((view) => view !== 'tasks' || showTasks).map((view) => {
        const meta = VIEW_META[view];
        const count = counts[view] ?? 0;
        return (
          <button
            key={view}
            type="button"
            className={`f${isOn(folder, view) ? ' on' : ''}`}
            title={`${meta.label} (G ${meta.g})`}
            aria-current={isOn(folder, view) ? 'page' : undefined}
            onClick={() => {
              selectFolder(folderFor(view));
            }}
          >
            <FolderIcon name={folderIconOf(view)} />
            <span className="fl">{meta.label}</span>
            {count > 0 ? <span className="n">{count}</span> : null}
          </button>
        );
      })}
      {labels.length === 0 ? null : <h5>Štítky</h5>}
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          className={`f${folder.kind === 'label' && folder.labelId === label.id ? ' on' : ''}`}
          onClick={() => {
            selectFolder({ kind: 'label', labelId: label.id });
          }}
        >
          <span className="lbl-dot" style={{ ['--d' as string]: colors.of(label.name) }} />
          <span className="fl">{label.name}</span>
        </button>
      ))}
    </>
  );
}
