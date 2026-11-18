import type { Mailbox } from '@relay/shared';
import { useMailboxes } from '../../data/hooks/use-mail-queries';
import type { Folder } from '../../state/folders';

export const useFolderMailbox = (folder: Folder): Mailbox | null => {
  const mailboxes = useMailboxes(folder.kind === 'mailbox' ? folder.accountId : null);
  if (folder.kind !== 'mailbox') {
    return null;
  }
  return mailboxes.data?.find((mailbox) => mailbox.id === folder.mailboxId) ?? null;
};
