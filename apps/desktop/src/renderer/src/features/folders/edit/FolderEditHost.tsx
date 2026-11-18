import { ConfirmDialog } from '@relay/ui';
import { FOLDER_COPY } from './folder-copy';
import { setFolderEdit, useFolderEdit } from './folder-edit-store';
import { FolderMenu } from './FolderMenu';
import { FolderMovePicker } from './FolderMovePicker';
import { useFolderActions } from './use-folder-actions';

export function FolderEditHost() {
  const edit = useFolderEdit((state) => state.edit);
  const actions = useFolderActions();
  if (edit?.kind === 'menu') {
    return <FolderMenu target={edit.target} anchor={edit.anchor} />;
  }
  if (edit?.kind === 'move') {
    return <FolderMovePicker target={edit.target} anchor={edit.anchor} />;
  }
  if (edit?.kind !== 'delete') {
    return null;
  }
  const { target } = edit;
  const copy = FOLDER_COPY[target.kind];
  return (
    <ConfirmDialog
      title={copy.deleteTitle(target.name)}
      text={copy.deleteText}
      confirmLabel="Zmazať"
      onCancel={() => {
        setFolderEdit(null);
      }}
      onConfirm={() => {
        setFolderEdit(null);
        void actions.remove(target);
      }}
    />
  );
}
