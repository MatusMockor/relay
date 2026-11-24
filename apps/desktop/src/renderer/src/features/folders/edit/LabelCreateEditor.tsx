import type { AccountId } from '@relay/shared';
import { describeError } from '../../../data/errors';
import { useCreateLabel } from '../../../data/hooks/use-label-mutations';
import { showToast } from '../../../state/toast-store';
import { FOLDER_COPY } from './folder-copy';
import { FolderNameInput } from './FolderNameInput';
import { useOwnEditClose } from './use-own-edit-close';

export function LabelCreateEditor({
  accountId,
  depth,
}: {
  readonly accountId: AccountId;
  readonly depth: number;
}) {
  const create = useCreateLabel();
  const close = useOwnEditClose();
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
