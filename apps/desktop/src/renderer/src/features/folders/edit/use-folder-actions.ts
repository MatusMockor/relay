import type { AccountId, MailboxId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../../data/errors';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useClient } from '../../../data/hooks/services-context';
import { INBOX } from '../../../state/folders';
import { showToast } from '../../../state/toast-store';
import { useUiStore } from '../../../state/ui-store';
import { selectFolder } from '../../mail/navigation';
import { FOLDER_COPY } from './folder-copy';
import type { FolderTarget } from './folder-edit-store';

const showsFolder = (target: FolderTarget): boolean => {
  const folder = useUiStore.getState().folder;
  if (folder.kind === 'label') {
    return folder.labelId === target.labelId;
  }
  return folder.kind === 'mailbox' && folder.mailboxId === target.mailbox.id;
};

export const useFolderActions = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const run = async (accountId: AccountId, work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes(accountId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.labels() }),
      ]);
      return true;
    } catch (error) {
      showToast(describeError(error));
      return false;
    }
  };
  return {
    create: (accountId: AccountId, name: string, parentId: MailboxId | null) =>
      run(accountId, () => client.createFolder(accountId, { name, parentId })),
    rename: (target: FolderTarget, name: string) =>
      run(target.mailbox.accountId, () => client.updateFolder(target.mailbox.id, { name })),
    move: (target: FolderTarget, parentId: MailboxId | null) =>
      run(target.mailbox.accountId, () => client.updateFolder(target.mailbox.id, { parentId })),
    remove: async (target: FolderTarget) => {
      const removed = await run(target.mailbox.accountId, () =>
        client.deleteFolder(target.mailbox.id),
      );
      if (!removed) {
        return;
      }
      if (showsFolder(target)) {
        selectFolder(INBOX);
      }
      showToast(FOLDER_COPY[target.kind].deleted(target.name));
    },
  };
};
