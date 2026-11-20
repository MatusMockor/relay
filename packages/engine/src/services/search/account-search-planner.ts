import type { MailAccount, UserId } from '@relay/shared/domain';
import type { RemoteTextSearchField } from '../../model/remote-mail';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { OfflineWindowPolicy } from '../../ports/offline-window-policy';
import type { SplitRepository } from '../../ports/split-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { SyncOptions } from '../sync/sync-options';
import type { HistoryCompletion } from './history-completion';
import { searchMailboxes } from './search-mailboxes';
import { type AccountSearchPlan, planAccountSearch } from './search-plan';
import type { SearchOptions } from './search-options';
import type { AccountSearchScope } from './search-scope';

export interface AccountSearchPlannerDeps {
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly splits: SplitRepository;
  readonly completion: HistoryCompletion;
  readonly offlineWindow: OfflineWindowPolicy | undefined;
  readonly sync: SyncOptions;
  readonly options: SearchOptions;
}

export interface PlannedAccountSearch {
  readonly scope: AccountSearchScope;
  readonly plan: AccountSearchPlan;
}

export interface SearchIntent {
  readonly terms: readonly string[];
  readonly field: RemoteTextSearchField;
}

export class AccountSearchPlanner {
  constructor(private readonly deps: AccountSearchPlannerDeps) {}

  async plan(
    userId: UserId,
    account: MailAccount,
    intent: SearchIntent,
  ): Promise<PlannedAccountSearch> {
    const mailboxes = await this.deps.mailboxes.listByAccount(userId, account.id);
    const states = await this.deps.syncStates.listByAccount(account.id);
    const targets = searchMailboxes(account, mailboxes, states, {
      sync: this.deps.sync,
      maxFolders: this.deps.options.maxFolders,
    });
    const plan = planAccountSearch({
      ...intent,
      targets,
      historyComplete: await this.deps.completion.isComplete(mailboxes, states),
      cutoff: await this.deps.offlineWindow?.cutoff(),
      limit: this.deps.options.uidsPerMailbox,
    });
    const splits =
      plan.kind === 'skip' ? [] : await this.deps.splits.listForAccount(userId, account.id);
    return { scope: { userId, account, mailboxes, splits }, plan };
  }
}
