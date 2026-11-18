import type { Mailbox } from '@relay/shared';
import { syncedFolders } from '../folders/folder-sections';

export interface MoveTarget {
  readonly mailbox: Mailbox;
  readonly label: string;
  readonly kind: 'inbox' | 'archive' | 'folder' | 'label';
}

const fullPath = (mailbox: Mailbox): string =>
  mailbox.delimiter === null || mailbox.delimiter === ''
    ? mailbox.path
    : mailbox.path.split(mailbox.delimiter).filter(Boolean).join(' / ');

const roleTarget = (mailboxes: readonly Mailbox[], role: 'inbox' | 'archive', label: string) =>
  mailboxes
    .filter((mailbox) => mailbox.role === role)
    .slice(0, 1)
    .map((mailbox): MoveTarget => ({ mailbox, label, kind: role }));

const byLabel = (left: MoveTarget, right: MoveTarget): number =>
  left.label.localeCompare(right.label, 'sk');

export const moveTargetsOf = (mailboxes: readonly Mailbox[]): MoveTarget[] => [
  ...roleTarget(mailboxes, 'inbox', 'Doručená pošta'),
  ...roleTarget(mailboxes, 'archive', 'Archív'),
  ...[
    ...syncedFolders(mailboxes).map(
      (mailbox): MoveTarget => ({ mailbox, label: fullPath(mailbox), kind: 'folder' }),
    ),
    ...mailboxes
      .filter((mailbox) => mailbox.role === 'label')
      .map((mailbox): MoveTarget => ({ mailbox, label: fullPath(mailbox), kind: 'label' })),
  ].sort(byLabel),
];
