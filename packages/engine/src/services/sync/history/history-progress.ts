import type {
  AccountId,
  HistoryProgress,
  HistoryState,
  Mailbox,
  MailboxRole,
  UserId,
} from '@relay/shared/domain';
import type { AccountRepository } from '../../../ports/account-repository';
import type { HistoryBackfillRepository } from '../../../ports/history-backfill-repository';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { SyncStateRepository } from '../../../ports/sync-state-repository';
import { completedSyncState } from '../completed-sync-state';
import { selectMailboxes } from '../mailbox-selection';
import type { SyncOptions } from '../sync-options';
import { historyComplete } from './history-complete';
import { HISTORY_ROLE_ORDER } from './history-mailboxes';
import { countHistory } from './history-count';

export interface HistoryProgressDeps {
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly store: HistoryBackfillRepository;
  readonly options: SyncOptions;
}

const stateOf = (
  done: readonly boolean[],
  validities: readonly (number | null)[],
): HistoryState => {
  if (done.length > 0 && done.every(Boolean)) {
    return 'done';
  }
  if (validities.every((validity) => validity === null)) {
    return 'waiting';
  }
  return 'running';
};

export class HistoryProgressReader {
  constructor(private readonly deps: HistoryProgressDeps) {}

  async forUser(userId: UserId): Promise<HistoryProgress[]> {
    const accounts = await this.deps.accounts.listByUser(userId);
    return Promise.all(accounts.map((account) => this.forAccount(userId, account.id)));
  }

  async forAccount(userId: UserId, accountId: AccountId): Promise<HistoryProgress> {
    const targets = this.targets(await this.deps.mailboxes.listByAccount(userId, accountId));
    const account = await this.deps.accounts.findById(userId, accountId);
    const count = await countHistory(this.deps.store, account, accountId, targets);
    const states = new Map(
      (await this.deps.syncStates.listByAccount(accountId)).map((state) => [
        state.mailboxId,
        completedSyncState(state)?.uidValidity ?? null,
      ]),
    );
    const validities = targets.map(([mailbox]) => states.get(mailbox.id) ?? null);
    const done = await Promise.all(
      targets.map(async ([mailbox], index) =>
        historyComplete(await this.deps.store.find(mailbox.id), validities[index] ?? null),
      ),
    );
    return { accountId, ...count, state: stateOf(done, validities) };
  }

  private targets(mailboxes: readonly Mailbox[]): [Mailbox, MailboxRole][] {
    return selectMailboxes(mailboxes, this.deps.options).filter(([, role]) =>
      HISTORY_ROLE_ORDER.includes(role),
    );
  }
}
