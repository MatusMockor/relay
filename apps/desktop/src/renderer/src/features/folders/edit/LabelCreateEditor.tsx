import type { AccountId } from '@relay/shared';
import { describeError } from '../../../data/errors';
import { useCreateLabel } from '../../../data/hooks/use-label-mutations';
import { showToast } from '../../../state/toast-store';
import { FOLDER_COPY } from './folder-copy';
import { setFolderEdit } from './folder-edit-store';
import { FolderNameInput } from './FolderNameInput';

const close = () => {
  setFolderEdit(null);
};

export function LabelCreateEditor({
  accountId,
  depth,
}: {
  readonly accountId: AccountId;
  readonly depth: number;
}) {
  const create = useCreateLabel();
  const submit = (name: string): Promise<boolean> =>
    create
      .mutateAsync({ accountId, name })
      .then(() => true)
      .catch((error: unknown) => {
        showToast(describeError(error));
        return false;
      });
  return (
    <FolderNameInput
      initial=""
      label={FOLDER_COPY.label.newTop}
      depth={depth}
      onSubmit={submit}
      onClose={close}
    />
  );
}
