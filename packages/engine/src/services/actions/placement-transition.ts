import type { MailAccount, MailboxRole } from '@relay/shared/domain';
import { labelsMessages } from '../shared/mail-copies';

const REMOVES_EVERY_LABEL: ReadonlySet<MailboxRole> = new Set(['trash', 'spam']);

export const keepsSource = (
  account: MailAccount,
  sourceRole: MailboxRole,
  targetRole: MailboxRole,
): boolean =>
  labelsMessages(account) && sourceRole === 'archive' && !REMOVES_EVERY_LABEL.has(targetRole);
