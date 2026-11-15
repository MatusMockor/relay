import type { ThreadListQuery, ThreadPage } from '@relay/shared/api';
import type { UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { SplitRepository } from '../../ports/split-repository';
import type { ThreadRepository } from '../../ports/thread-repository';

export interface InboxQueryServiceDeps {
  readonly threads: ThreadRepository;
  readonly splits: SplitRepository;
  readonly accounts: AccountRepository;
}

export class InboxQueryService {
  constructor(private readonly deps: InboxQueryServiceDeps) {}

  async list(userId: UserId, query: ThreadListQuery): Promise<ThreadPage> {
    await this.assertAccount(userId, query);
    await this.assertSplit(userId, query);
    return this.deps.threads.queryFolder(userId, {
      view: query.view,
      accountId: query.accountId ?? null,
      splitId: query.splitId ?? null,
      labelId: query.labelId ?? null,
      search: query.q ?? null,
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
  }

  private async assertAccount(userId: UserId, query: ThreadListQuery): Promise<void> {
    if (query.accountId === undefined) {
      return;
    }
    const account = await this.deps.accounts.findById(userId, query.accountId);
    if (account === null) {
      throw new NotFoundError('Account', query.accountId);
    }
  }

  private async assertSplit(userId: UserId, query: ThreadListQuery): Promise<void> {
    const splitId = query.splitId;
    if (splitId === undefined) {
      return;
    }
    const splits = await this.deps.splits.listByUser(userId);
    if (!splits.some((split) => split.id === splitId)) {
      throw new NotFoundError('Split', splitId);
    }
  }
}
