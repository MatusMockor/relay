import type { Label, MailAccount, Mailbox } from '@relay/shared';
import { FolderIcon } from '@relay/ui';
import { useUiStore } from '../../../state/ui-store';
import { useLabelColor } from '../../labels/use-label-color';
import { selectFolder } from '../../mail/navigation';
import type { TreeLeaf } from '../FolderTreeRows';
import {
  type FolderTarget,
  isCreatingUnder,
  isRenaming,
  setFolderEdit,
  useFolderEdit,
} from './folder-edit-store';
import { CreateEditor, RenameEditor } from './FolderEditors';

const editable = (target: FolderTarget): Pick<TreeLeaf, 'onMenu'> => ({
  onMenu: (anchor) => {
    setFolderEdit({ kind: 'menu', target, anchor });
  },
});

export const useFolderLeaves = (account: MailAccount, mailboxes: readonly Mailbox[]) => {
  const folder = useUiStore((state) => state.folder);
  const edit = useFolderEdit((state) => state.edit);
  const colorOf = useLabelColor();
  const editors = (target: FolderTarget): Partial<TreeLeaf> => ({
    ...editable(target),
    ...(isRenaming(edit, target.mailbox)
      ? { editor: (depth: number) => <RenameEditor target={target} depth={depth} /> }
      : {}),
    ...(isCreatingUnder(edit, target.mailbox)
      ? {
          childEditor: (depth: number) => (
            <CreateEditor
              accountId={account.id}
              parent={target.mailbox}
              kind={target.kind}
              depth={depth}
            />
          ),
        }
      : {}),
  });
  const mailboxLeaf = (mailbox: Mailbox): TreeLeaf => ({
    icon: <FolderIcon name="folder" />,
    on: folder.kind === 'mailbox' && folder.mailboxId === mailbox.id,
    count: mailbox.unreadCount,
    title: mailbox.path,
    onSelect: () => {
      selectFolder({ kind: 'mailbox', mailboxId: mailbox.id, accountId: account.id });
    },
    ...editors({ mailbox, kind: 'folder', name: mailbox.name }),
  });
  const labelLeaf = (label: Label): TreeLeaf => {
    const mailbox = mailboxes.find(
      (candidate) => candidate.role === 'label' && candidate.path === label.remoteName,
    );
    const target: FolderTarget | null =
      label.kind === 'gmail' && mailbox !== undefined
        ? { mailbox, kind: 'label', name: mailbox.name, labelId: label.id }
        : null;
    return {
      icon: <span className="lbl-dot" style={{ ['--d' as string]: colorOf(label) }} />,
      on: folder.kind === 'label' && folder.labelId === label.id,
      count: 0,
      title: label.name,
      onSelect: () => {
        selectFolder({ kind: 'label', labelId: label.id });
      },
      ...(target === null ? {} : editors(target)),
    };
  };
  const creatingTop =
    edit?.kind === 'create' && edit.accountId === account.id && isCreatingUnder(edit, null);
  return { mailboxLeaf, labelLeaf, creatingTop };
};
