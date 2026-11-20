import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { MailboxSyncState } from '../../../model/sync-state';
import { completedSyncState } from '../completed-sync-state';
import { selectMailboxes } from '../mailbox-selection';
import type { SyncOptions } from '../sync-options';

export interface HistoryTarget {
  readonly mailbox: Mailbox;
  readonly state: MailboxSyncState;
}

export const HISTORY_ROLE_ORDER: readonly MailboxRole[] = [
  'inbox',
  'sent',
  'archive',
  'custom',
  'spam',
  'trash',
];

export const historyMailboxes = (
  mailboxes: readonly Mailbox[],
  states: readonly MailboxSyncState[],
  options: SyncOptions,
): HistoryTarget[] => {
  const stateOf = new Map(states.map((state) => [state.mailboxId, state]));
  const selected = selectMailboxes(mailboxes, options);
  return HISTORY_ROLE_ORDER.flatMap((role) =>
    selected.flatMap(([mailbox, selectedRole]) => {
      const state = completedSyncState(stateOf.get(mailbox.id) ?? null);
      if (selectedRole !== role || state === null) {
        return [];
      }
      return [{ mailbox, state }];
    }),
  );
};
