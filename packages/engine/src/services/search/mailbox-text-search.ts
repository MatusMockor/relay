import type { MailAccount } from '@relay/shared/domain';
import { UidValidityChangedError } from '../../errors';
import type { RemoteTextSearch, RemoteTextSearchResult } from '../../model/remote-mail';
import type { Logger } from '../../ports/logger';
import type { MailProvider } from '../../ports/mail-provider';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { errorMessage } from '../shared/mail-provider-sessions';
import { reachable } from '../shared/provider-reachability';
import type { SearchTarget } from './search-mailboxes';
import type { SearchLiveness } from './search-scope';

export type MailboxSearchResult = RemoteTextSearchResult | 'failed' | 'offline' | 'obsolete';

const FAILED: MailboxSearchResult = 'failed';
const OBSOLETE: MailboxSearchResult = 'obsolete';

const searchReachable = async (
  provider: MailProvider,
  target: SearchTarget,
  query: RemoteTextSearch,
): Promise<MailboxSearchResult> => {
  try {
    return await provider.searchText(target.mailbox.path, target.state.uidValidity, query);
  } catch (error) {
    if (error instanceof UidValidityChangedError || (await reachable(provider))) {
      return FAILED;
    }
    throw error;
  }
};

export class MailboxTextSearch {
  constructor(
    private readonly sessions: LingeringSessions,
    private readonly logger: Logger,
  ) {}

  async search(
    account: MailAccount,
    target: SearchTarget,
    query: RemoteTextSearch,
    live: SearchLiveness,
  ): Promise<MailboxSearchResult> {
    try {
      return await this.sessions.with(account, (provider) =>
        live() ? searchReachable(provider, target, query) : Promise.resolve(OBSOLETE),
      );
    } catch (error) {
      this.logger.info('Server search cannot reach the mail server', {
        accountId: account.id,
        error: errorMessage(error),
      });
      return 'offline';
    }
  }
}
