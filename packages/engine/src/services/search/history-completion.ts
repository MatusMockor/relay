import type { Mailbox } from '@relay/shared/domain';
import type { MailboxSyncState } from '../../model/sync-state';
import type { HistoryBackfillRepository } from '../../ports/history-backfill-repository';
import { selectMailboxes } from '../sync/mailbox-selection';
import { HISTORY_ROLE_ORDER, historyMailboxes } from '../sync/history/history-mailboxes';
import type { SyncOptions } from '../sync/sync-options';

export class HistoryCompletion {
  constructor(
    private readonly store: HistoryBackfillRepository | undefined,
    private readonly options: SyncOptions,
  ) {}

  async isComplete(
    mailboxes: readonly Mailbox[],
    states: readonly MailboxSyncState[],
  ): Promise<boolean> {
    const store = this.store;
    if (store === undefined) {
      return false;
    }
    const targets = historyMailboxes(mailboxes, states, this.options);
    const selected = selectMailboxes(mailboxes, this.options).filter(([, role]) =>
      HISTORY_ROLE_ORDER.includes(role),
    );
    if (targets.length === 0 || targets.length < selected.length) {
      return false;
    }
    const cursors = await Promise.all(targets.map((target) => store.find(target.mailbox.id)));
    return cursors.every(
      (cursor, index) =>
        cursor !== null &&
        cursor.doneAt !== null &&
        cursor.uidValidity === targets[index]?.state.uidValidity,
    );
  }
}
