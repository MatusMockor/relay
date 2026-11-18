import type { Mailbox, MailboxId } from '@relay/shared';
import { syncedFolders } from '../folder-sections';
import type { FolderTarget } from './folder-edit-store';

export interface FolderDestination {
  readonly parentId: MailboxId | null;
  readonly label: string;
}

const inTree = (root: Mailbox, path: string): boolean =>
  path === root.path ||
  (root.delimiter !== null && path.startsWith(`${root.path}${root.delimiter}`));

const parentPathOf = (mailbox: Mailbox): string | null => {
  const index = mailbox.delimiter === null ? -1 : mailbox.path.lastIndexOf(mailbox.delimiter);
  return index <= 0 ? null : mailbox.path.slice(0, index);
};

const readable = (mailbox: Mailbox): string =>
  mailbox.delimiter === null ? mailbox.path : mailbox.path.split(mailbox.delimiter).join(' / ');

const candidatesOf = (target: FolderTarget, mailboxes: readonly Mailbox[]): Mailbox[] =>
  target.kind === 'label'
    ? mailboxes.filter((mailbox) => mailbox.role === 'label')
    : syncedFolders(mailboxes);

export const folderDestinations = (
  target: FolderTarget,
  mailboxes: readonly Mailbox[],
): FolderDestination[] => {
  const current = parentPathOf(target.mailbox);
  const nested = candidatesOf(target, mailboxes)
    .filter((mailbox) => !inTree(target.mailbox, mailbox.path) && mailbox.path !== current)
    .map((mailbox) => ({ parentId: mailbox.id, label: readable(mailbox) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'sk'));
  const top = mailboxes.find((mailbox) => mailbox.path === current);
  const atTop = current === null || (top !== undefined && top.role === 'inbox');
  return atTop ? nested : [{ parentId: null, label: 'Najvyššia úroveň' }, ...nested];
};
