import type { Mailbox } from '@relay/shared';
import { MailClientError } from '../errors';

const EDITABLE = new Set(['custom', 'label']);
const RESERVED = new Set(['inbox', '[gmail]', '[google mail]']);

export const folderError = (
  code: 'validation_failed' | 'conflict' | 'forbidden',
  message: string,
) => new MailClientError({ code, message });

export const assertDemoEditable = (mailbox: Mailbox): void => {
  if (!EDITABLE.has(mailbox.role)) {
    throw folderError('forbidden', 'Systémový priečinok nie je možné upraviť');
  }
};

export const inTree = (root: Mailbox, path: string): boolean =>
  path === root.path ||
  (root.delimiter !== null && path.startsWith(`${root.path}${root.delimiter}`));

export const parentPathOf = (mailbox: Mailbox): string | null => {
  const index = mailbox.delimiter === null ? -1 : mailbox.path.lastIndexOf(mailbox.delimiter);
  return index <= 0 ? null : mailbox.path.slice(0, index);
};

const topPrefix = (mailboxes: readonly Mailbox[], delimiter: string): string => {
  const others = mailboxes.filter((mailbox) => mailbox.path.toUpperCase() !== 'INBOX');
  const nested = others.every((mailbox) => mailbox.path.startsWith(`INBOX${delimiter}`));
  return others.length > 0 && nested ? `INBOX${delimiter}` : '';
};

export const demoFolderName = (raw: string, delimiter: string): string => {
  const name = raw.trim();
  if (name === '') {
    throw folderError('validation_failed', 'Názov priečinka nemôže byť prázdny.');
  }
  if ([delimiter, '*', '%'].some((character) => name.includes(character))) {
    throw folderError(
      'validation_failed',
      `Názov priečinka nemôže obsahovať znaky „${delimiter}“, „*“, „%“.`,
    );
  }
  if (RESERVED.has(name.toLowerCase())) {
    throw folderError('validation_failed', 'Tento názov je vyhradený pre systémový priečinok.');
  }
  return name;
};

export const demoFolderPath = (
  name: string,
  parentPath: string | null,
  account: readonly Mailbox[],
  delimiter: string,
): string => {
  const path =
    parentPath === null
      ? `${topPrefix(account, delimiter)}${name}`
      : `${parentPath}${delimiter}${name}`;
  if (account.some((mailbox) => mailbox.path.toLowerCase() === path.toLowerCase())) {
    throw folderError('conflict', 'Priečinok s týmto názvom tu už existuje.');
  }
  return path;
};
