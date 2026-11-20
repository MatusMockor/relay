import type {
  ServerSearchRequest,
  ServerSearchResponse,
  ServerSearchStatus,
} from '@relay/shared/api';
import type { MailAccount, UserId } from '@relay/shared/domain';
import type { AccountRepository } from '../../ports/account-repository';
import type { IntervalTimer } from '../../ports/interval-timer';
import type { ThreadRepository } from '../../ports/thread-repository';
import type { AccountSearchPlanner, SearchIntent } from './account-search-planner';
import type { AccountTextSearch } from './account-text-search';
import { EXPIRED, raceDeadline } from './search-deadline';
import { SearchGenerations } from './search-generations';
import { SearchHits } from './search-hits';
import type { SearchOptions } from './search-options';
import type { AccountSearchOutcome, SearchLiveness } from './search-scope';
import { searchTerms } from './search-terms';

export interface ServerSearchServiceDeps {
  readonly accounts: AccountRepository;
  readonly threads: ThreadRepository;
  readonly planner: AccountSearchPlanner;
  readonly search: AccountTextSearch;
  readonly timer: IntervalTimer;
  readonly options: SearchOptions;
}

export const combineSearchOutcomes = (
  outcomes: readonly AccountSearchOutcome[],
): ServerSearchStatus => {
  const searched = outcomes.filter((outcome) => outcome !== 'skipped');
  if (searched.length === 0) {
    return 'skipped';
  }
  if (searched.every((outcome) => outcome === 'offline')) {
    return 'offline';
  }
  return searched.every((outcome) => outcome === 'ok') ? 'ok' : 'partial';
};

export class ServerSearchService {
  private readonly generations = new SearchGenerations();

  constructor(private readonly deps: ServerSearchServiceDeps) {}

  async search(userId: UserId, request: ServerSearchRequest): Promise<ServerSearchResponse> {
    const generation = this.generations.next(userId);
    const hits = new SearchHits(this.deps.threads, userId, request);
    const intent: SearchIntent = {
      terms: searchTerms(request.q, this.deps.options.maxTerms),
      field: request.searchField ?? 'all',
    };
    let expired = false;
    const live = () => !expired && this.generations.isCurrent(userId, generation);
    const accounts = await this.accountsOf(userId, request);
    const work = Promise.all(
      accounts.map((account) => this.searchAccount(userId, account, intent, hits, live)),
    );
    const outcome = await raceDeadline(this.deps.timer, this.deps.options.deadlineMs, work);
    expired = true;
    if (!this.generations.isCurrent(userId, generation)) {
      return { requestId: request.requestId, status: 'skipped', hits: [] };
    }
    const status = outcome === EXPIRED ? 'partial' : combineSearchOutcomes(outcome);
    return { requestId: request.requestId, status, hits: hits.list() };
  }

  private async searchAccount(
    userId: UserId,
    account: MailAccount,
    intent: SearchIntent,
    hits: SearchHits,
    live: SearchLiveness,
  ): Promise<AccountSearchOutcome> {
    const { scope, plan } = await this.deps.planner.plan(userId, account, intent);
    if (plan.kind === 'skip') {
      return 'skipped';
    }
    return this.deps.search.run({ scope, query: plan.query, hits, live }, plan.targets);
  }

  private async accountsOf(userId: UserId, request: ServerSearchRequest): Promise<MailAccount[]> {
    if (request.accountId === undefined) {
      return this.deps.accounts.listByUser(userId);
    }
    const account = await this.deps.accounts.findById(userId, request.accountId);
    return account === null ? [] : [account];
  }
}
