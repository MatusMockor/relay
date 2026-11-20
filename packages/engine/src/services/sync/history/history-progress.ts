import type {
  AccountId,
  HistoryProgress,
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
import { countedMailboxes } from './progress-mailboxes';

export interface HistoryProgressDeps {
  readonly accounts: AccountRepository;
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly store: HistoryBackfillRepository;
  readonly options: SyncOptions;
}

export class HistoryProgressReader {
  constructor(private readonly deps: HistoryProgressDeps) {}

  async forUser(userId: UserId): Promise<HistoryProgress[]> {
    const accounts = await this.deps.accounts.listByUser(userId);
    return Promise.all(accounts.map((account) => this.forAccount(userId, account.id)));
  }

  async forAccount(userId: UserId, accountId: AccountId): Promise<HistoryProgress> {
    const targets = this.targets(await this.deps.mailboxes.listByAccount(userId, accountId));
    const mailboxes = targets.map(([mailbox]) => mailbox);
    const counted = countedMailboxes(await this.deps.accounts.findById(userId, accountId), targets);
    const states = new Map(
      (await this.deps.syncStates.listByAccount(accountId)).map((state) => [
        state.mailboxId,
        state,
      ]),
    );
    const counts = new Map(
      (await this.deps.store.countsByMailbox(accountId)).map((count) => [
        count.mailboxId,
        count.stored,
      ]),
    );
    const done = await Promise.all(
      mailboxes.map(async (mailbox) =>
        historyComplete(
          await this.deps.store.find(mailbox.id),
          completedSyncState(states.get(mailbox.id) ?? null)?.uidValidity ?? null,
        ),
      ),
    );
    return {
      accountId,
      stored: counted.reduce(
        (sum, mailbox) => sum + Math.min(counts.get(mailbox.id) ?? 0, mailbox.totalCount),
        0,
      ),
      total: counted.reduce((sum, mailbox) => sum + mailbox.totalCount, 0),
      state: done.length > 0 && done.every(Boolean) ? 'done' : 'running',
    };
  }

  private targets(mailboxes: readonly Mailbox[]): [Mailbox, MailboxRole][] {
    return selectMailboxes(mailboxes, this.deps.options).filter(([, role]) =>
      HISTORY_ROLE_ORDER.includes(role),
    );
  }
}
