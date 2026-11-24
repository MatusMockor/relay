import type { AccountId, Mailbox } from '@relay/shared';
import { FOLDER_COPY } from './folder-copy';
import type { FolderKind, FolderTarget } from './folder-edit-store';
import { FolderNameInput } from './FolderNameInput';
import { useFolderActions } from './use-folder-actions';
import { useOwnEditClose } from './use-own-edit-close';

export function RenameEditor({
  target,
  depth,
}: {
  readonly target: FolderTarget;
  readonly depth: number;
}) {
  const actions = useFolderActions();
  const close = useOwnEditClose();
  return (
    <FolderNameInput
      initial={target.name}
      label={`Premenovať ${target.name}`}
      depth={depth}
      onSubmit={(name) => actions.rename(target, name)}
      onClose={close}
    />
  );
}

export function CreateEditor({
  accountId,
  parent,
  kind,
  depth,
}: {
  readonly accountId: AccountId;
  readonly parent: Mailbox | null;
  readonly kind: FolderKind;
  readonly depth: number;
}) {
  const actions = useFolderActions();
  const close = useOwnEditClose();
  const copy = FOLDER_COPY[kind];
  return (
    <FolderNameInput
      initial=""
      label={parent === null ? copy.newTop : copy.newChild}
      depth={depth}
      onSubmit={(name) => actions.create(accountId, name, parent?.id ?? null)}
      onClose={close}
    />
  );
}
