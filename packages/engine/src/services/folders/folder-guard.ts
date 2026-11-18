import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import { ForbiddenError } from '../../errors';

const EDITABLE_ROLES: readonly MailboxRole[] = ['custom', 'label'];
const RESERVED_ROOTS: readonly string[] = ['inbox', '[gmail]', '[google mail]'];

export const SYSTEM_FOLDER_MESSAGE = 'Systémový priečinok nie je možné upraviť';

const topSegment = (path: string, delimiter: string | null): string =>
  delimiter === null || delimiter === '' ? path : (path.split(delimiter)[0] ?? path);

export const isReservedName = (name: string): boolean =>
  RESERVED_ROOTS.includes(name.trim().toLowerCase());

const isGmailSystemPath = (path: string, delimiter: string | null): boolean => {
  const top = topSegment(path, delimiter).toLowerCase();
  return top !== 'inbox' && RESERVED_ROOTS.includes(top);
};

export const isSystemFolder = (mailbox: Mailbox): boolean =>
  !EDITABLE_ROLES.includes(mailbox.role) ||
  mailbox.path.toLowerCase() === 'inbox' ||
  isGmailSystemPath(mailbox.path, mailbox.delimiter);

export const assertEditable = (mailbox: Mailbox): void => {
  if (isSystemFolder(mailbox)) {
    throw new ForbiddenError(SYSTEM_FOLDER_MESSAGE);
  }
};
