import type { Message } from '@relay/shared/domain';
import type { RemoteTextSearch } from '../../model/remote-mail';
import type { MailboxTextSearch } from './mailbox-text-search';
import type { SearchHitIngest } from './search-hit-ingest';
import type { SearchHitResolver } from './search-hit-resolver';
import type { SearchHits } from './search-hits';
import type { SearchTarget } from './search-mailboxes';
import type { AccountSearchOutcome, AccountSearchScope, SearchLiveness } from './search-scope';

export interface AccountTextSearchDeps {
  readonly mailboxSearch: MailboxTextSearch;
  readonly resolver: SearchHitResolver;
  readonly ingest: SearchHitIngest;
}

interface SearchRun {
  readonly scope: AccountSearchScope;
  readonly query: RemoteTextSearch;
  readonly hits: SearchHits;
  readonly live: SearchLiveness;
}

type MailboxOutcome = 'complete' | 'incomplete' | 'offline';

export class AccountTextSearch {
  constructor(private readonly deps: AccountTextSearchDeps) {}

  async run(run: SearchRun, targets: readonly SearchTarget[]): Promise<AccountSearchOutcome> {
    let complete = true;
    for (const target of targets) {
      if (!run.live()) {
        return 'partial';
      }
      const outcome = await this.mailbox(run, target);
      if (outcome === 'offline') {
        return target === targets[0] ? 'offline' : 'partial';
      }
      complete = complete && outcome === 'complete';
    }
    return complete ? 'ok' : 'partial';
  }

  private async mailbox(run: SearchRun, target: SearchTarget): Promise<MailboxOutcome> {
    const { account } = run.scope;
    const found = await this.deps.mailboxSearch.search(account, target, run.query, run.live);
    if (found === 'offline') {
      return 'offline';
    }
    if (found === 'failed' || found === 'obsolete') {
      return 'incomplete';
    }
    const stored = await this.deps.resolver.stored(target, found.uids);
    if (stored === null) {
      return 'incomplete';
    }
    const missing = found.uids.filter((uid) => !stored.has(uid) && uid <= target.state.lastUid);
    const ingested = await this.ingestMissing(run, target, missing);
    const added = await this.deps.resolver.stored(target, ingested ? missing : []);
    if (added === null) {
      return 'incomplete';
    }
    await run.hits.add(found.uids.flatMap((uid) => present(stored.get(uid) ?? added.get(uid))));
    return found.complete && ingested ? 'complete' : 'incomplete';
  }

  private ingestMissing(
    run: SearchRun,
    target: SearchTarget,
    missing: readonly number[],
  ): Promise<boolean> {
    if (missing.length === 0) {
      return Promise.resolve(true);
    }
    return this.deps.ingest.ingest(run.scope, target, missing, run.live);
  }
}

const present = (message: Message | undefined): Message[] =>
  message === undefined ? [] : [message];
