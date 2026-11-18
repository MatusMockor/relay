import type { FolderView, LabelId, MailboxId } from '@relay/shared/domain';
import { ToolInputError } from './mail-tool';

interface FolderTargetInput {
  readonly view: FolderView;
  readonly labelId?: LabelId;
  readonly mailboxId?: MailboxId;
}

export interface FolderTarget {
  readonly labelId: LabelId | null;
  readonly mailboxId: MailboxId | null;
}

export const folderTarget = (input: FolderTargetInput): FolderTarget => {
  if (input.view === 'mailbox' && input.mailboxId === undefined) {
    throw new ToolInputError('View "mailbox" needs a mailboxId.');
  }
  if (input.view === 'label' && input.labelId === undefined) {
    throw new ToolInputError('View "label" needs a labelId.');
  }
  return { labelId: input.labelId ?? null, mailboxId: input.mailboxId ?? null };
};
