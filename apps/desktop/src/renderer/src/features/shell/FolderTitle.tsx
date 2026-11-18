import { FolderIcon } from '@relay/ui';
import { folderIconOf } from '../folders/folder-icons';
import { useFolderMailbox } from '../folders/use-folder-mailbox';
import { NEUTRAL } from '../colors/name-colors';
import { useLabelColor } from '../labels/use-label-color';
import { useLabels } from '../../data/hooks/use-mail-queries';
import { VIEW_META, viewOf } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';

export function FolderTitle() {
  const folder = useUiStore((state) => state.folder);
  const { items } = useMailActions();
  const labels = useLabels();
  const colorOf = useLabelColor();
  const mailbox = useFolderMailbox(folder);
  const count = items.length;
  if (folder.kind === 'label') {
    const label = labels.data?.find((item) => item.id === folder.labelId);
    return (
      <div className="a-title">
        <h2>
          <span
            className="lbl-dot"
            style={{ ['--d' as string]: label === undefined ? NEUTRAL : colorOf(label) }}
          />
          <span className="a-tt" title={label?.name ?? 'Štítok'}>
            {label?.name ?? 'Štítok'}
          </span>
          {count > 0 ? <b>{count}</b> : null}
        </h2>
      </div>
    );
  }
  if (folder.kind === 'mailbox') {
    const name = mailbox?.name ?? 'Priečinok';
    return (
      <div className="a-title">
        <h2>
          <FolderIcon name="folder" />
          <span className="a-tt" title={mailbox?.path ?? name}>
            {name}
          </span>
          {count > 0 ? <b>{count}</b> : null}
        </h2>
      </div>
    );
  }
  const view = viewOf(folder);
  const meta = VIEW_META[view];
  return (
    <div className="a-title">
      <h2>
        <FolderIcon name={folderIconOf(view)} />
        <span className="a-tt" title={meta.label}>
          {meta.label}
        </span>
        {count > 0 ? <b>{count}</b> : null}
      </h2>
    </div>
  );
}
