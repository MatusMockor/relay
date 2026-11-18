import type { Label, Mailbox } from '@relay/shared';
import type { FolderTreeEntry } from './folder-tree';

const GMAIL_LABEL_DELIMITER = '/';

const inboxPrefixOf = (mailbox: Mailbox): string | null =>
  mailbox.delimiter === null ? null : `INBOX${mailbox.delimiter}`;

const underInbox = (mailbox: Mailbox): boolean => {
  const prefix = inboxPrefixOf(mailbox);
  return prefix !== null && mailbox.path.toUpperCase().startsWith(prefix);
};

const topSegment = (path: string, delimiter: string | null): string =>
  delimiter === null ? path : (path.split(delimiter)[0] ?? path);

const displayPath = (mailbox: Mailbox, taken: ReadonlySet<string>): string => {
  const prefix = inboxPrefixOf(mailbox);
  if (prefix === null || !underInbox(mailbox)) {
    return mailbox.path;
  }
  const stripped = mailbox.path.slice(prefix.length);
  return taken.has(topSegment(stripped, mailbox.delimiter)) ? mailbox.path : stripped;
};

export const syncedFolders = (mailboxes: readonly Mailbox[]): Mailbox[] => {
  const custom = mailboxes.filter((mailbox) => mailbox.role === 'custom');
  const subscriptionsKnown = mailboxes.some((mailbox) => mailbox.subscribed);
  return subscriptionsKnown ? custom.filter((mailbox) => mailbox.subscribed) : custom;
};

export const mailboxEntries = (mailboxes: readonly Mailbox[]): FolderTreeEntry<Mailbox>[] => {
  const folders = syncedFolders(mailboxes);
  const taken = new Set(
    folders
      .filter((mailbox) => !underInbox(mailbox))
      .map((mailbox) => topSegment(mailbox.path, mailbox.delimiter)),
  );
  return folders.map((mailbox) => ({
    path: displayPath(mailbox, taken),
    delimiter: mailbox.delimiter,
    value: mailbox,
  }));
};

export const labelEntries = (labels: readonly Label[]): FolderTreeEntry<Label>[] =>
  labels.map((label) => ({
    path: label.name,
    delimiter: label.kind === 'gmail' ? GMAIL_LABEL_DELIMITER : null,
    value: label,
  }));
