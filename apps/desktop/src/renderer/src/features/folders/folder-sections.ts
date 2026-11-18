import type { Label, Mailbox } from '@relay/shared';
import type { FolderTreeEntry } from './folder-tree';

const GMAIL_LABEL_DELIMITER = '/';

const withoutInboxPrefix = (mailbox: Mailbox): string => {
  if (mailbox.delimiter === null) {
    return mailbox.path;
  }
  const prefix = `INBOX${mailbox.delimiter}`;
  return mailbox.path.toUpperCase().startsWith(prefix)
    ? mailbox.path.slice(prefix.length)
    : mailbox.path;
};

export const syncedFolders = (mailboxes: readonly Mailbox[]): Mailbox[] => {
  const custom = mailboxes.filter((mailbox) => mailbox.role === 'custom');
  const subscriptionsKnown = mailboxes.some((mailbox) => mailbox.subscribed);
  return subscriptionsKnown ? custom.filter((mailbox) => mailbox.subscribed) : custom;
};

export const mailboxEntries = (mailboxes: readonly Mailbox[]): FolderTreeEntry<Mailbox>[] =>
  syncedFolders(mailboxes).map((mailbox) => ({
    path: withoutInboxPrefix(mailbox),
    delimiter: mailbox.delimiter,
    value: mailbox,
  }));

export const labelEntries = (labels: readonly Label[]): FolderTreeEntry<Label>[] =>
  labels.map((label) => ({
    path: label.name,
    delimiter: label.kind === 'gmail' ? GMAIL_LABEL_DELIMITER : null,
    value: label,
  }));
