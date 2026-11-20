import type { MailAccount, Mailbox, MailboxRole } from '@relay/shared/domain';
import type { MailboxSyncState } from '../../model/sync-state';
import { labelsMessages } from '../shared/mail-copies';
import { completedSyncState } from '../sync/completed-sync-state';
import { selectMailboxes } from '../sync/mailbox-selection';
import type { SyncOptions } from '../sync/sync-options';

export interface SearchTarget {
  readonly mailbox: Mailbox;
  readonly state: MailboxSyncState;
}

const IMAP_ORDER: readonly MailboxRole[] = ['inbox', 'archive', 'sent', 'custom'];
const GMAIL_ORDER: readonly MailboxRole[] = ['archive'];

export const searchMailboxes = (
  account: MailAccount,
  mailboxes: readonly Mailbox[],
  states: readonly MailboxSyncState[],
  options: { readonly sync: SyncOptions; readonly maxFolders: number },
): SearchTarget[] => {
  const stateOf = new Map(states.map((state) => [state.mailboxId, state]));
  const selected = selectMailboxes(mailboxes, options.sync);
  const order = labelsMessages(account) ? GMAIL_ORDER : IMAP_ORDER;
  return order
    .flatMap((role) =>
      selected.flatMap(([mailbox, selectedRole]) => {
        const state = completedSyncState(stateOf.get(mailbox.id) ?? null);
        if (selectedRole !== role || state === null) {
          return [];
        }
        return [{ mailbox, state }];
      }),
    )
    .slice(0, options.maxFolders);
};
