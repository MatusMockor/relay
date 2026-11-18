import type { LabelKind, MailAccount } from '@relay/shared/domain';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import { labelsMessages } from '../shared/mail-copies';

export const labelKindOf = async (
  mailboxes: MailboxRepository,
  account: MailAccount,
): Promise<LabelKind> => {
  if (labelsMessages(account)) {
    return 'gmail';
  }
  const listed = await mailboxes.listForSync(account.id);
  return listed.some((mailbox) => mailbox.role === 'label') ? 'gmail' : 'keyword';
};
