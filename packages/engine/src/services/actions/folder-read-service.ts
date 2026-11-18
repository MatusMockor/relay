import type {
  MarkFolderReadBody,
  MarkFolderReadResponse,
  ThreadListQuery,
  ThreadPage,
} from '@relay/shared/api';
import type { AccountId, MailAccount, ThreadSummary, UserId } from '@relay/shared/domain';
import type { AccountRepository } from '../../ports/account-repository';
import type { Repositories } from '../../ports/repositories';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { chunked } from '../shared/chunked';
import type { EngineEvents } from '../shared/engine-events';
import { yieldToEventLoop } from '../shared/event-loop';
import type { PendingProviderOp } from '../shared/provider-ops';
import type { FlagWriter } from './handlers/flag-writer';
import type { ProviderMirror } from './provider-mirror';

export interface FolderThreadLister {
  list(userId: UserId, query: ThreadListQuery): Promise<ThreadPage>;
}

export interface FolderReadServiceDeps {
  readonly folders: FolderThreadLister;
  readonly accounts: AccountRepository;
  readonly unitOfWork: UnitOfWork;
  readonly flags: FlagWriter;
  readonly mirror: ProviderMirror;
  readonly events: EngineEvents;
  readonly pageSize: number;
}

interface ChunkReadResult {
  readonly threads: ThreadSummary[];
  readonly ops: PendingProviderOp[];
}

export class FolderReadService {
  constructor(private readonly deps: FolderReadServiceDeps) {}

  async markAllRead(userId: UserId, folder: MarkFolderReadBody): Promise<MarkFolderReadResponse> {
    const unread = await this.unreadThreads(userId, folder);
    let count = 0;
    for (const [accountId, threads] of groupByAccount(unread)) {
      count += await this.markAccount(userId, accountId, threads);
    }
    return { count };
  }

  private async unreadThreads(
    userId: UserId,
    folder: MarkFolderReadBody,
  ): Promise<ThreadSummary[]> {
    const unread: ThreadSummary[] = [];
    let cursor: string | null = null;
    do {
      const page: ThreadPage = await this.deps.folders.list(userId, {
        ...folder,
        limit: this.deps.pageSize,
        ...(cursor === null ? {} : { cursor }),
      });
      unread.push(...page.items.filter((thread) => thread.unread));
      cursor = page.nextCursor;
    } while (cursor !== null);
    return unread;
  }

  private async markAccount(
    userId: UserId,
    accountId: AccountId,
    threads: readonly ThreadSummary[],
  ): Promise<number> {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (account === null) {
      return 0;
    }
    let count = 0;
    for (const [index, batch] of chunked(threads, this.deps.pageSize).entries()) {
      if (index > 0) {
        await yieldToEventLoop();
      }
      count += await this.markChunk(userId, account, batch);
    }
    return count;
  }

  private async markChunk(
    userId: UserId,
    account: MailAccount,
    threads: readonly ThreadSummary[],
  ): Promise<number> {
    const result = await this.deps.unitOfWork.run((repositories) =>
      this.stageChunk(repositories, userId, account, threads),
    );
    await this.deps.mirror.apply(account, result.ops);
    for (const thread of result.threads) {
      await this.deps.events.emit(userId, 'thread.upserted', { thread });
    }
    return result.threads.length;
  }

  private async stageChunk(
    repositories: Repositories,
    userId: UserId,
    account: MailAccount,
    threads: readonly ThreadSummary[],
  ): Promise<ChunkReadResult> {
    const result: ChunkReadResult = { threads: [], ops: [] };
    for (const thread of threads) {
      const messages = await repositories.messages.listByThread(userId, thread.id);
      const targets = messages.filter((message) => !message.flags.seen);
      if (targets.length === 0) {
        continue;
      }
      const context = { userId, thread, account, messages };
      const staged = await this.deps.flags.stage(repositories, context, targets, 'seen', true);
      result.threads.push(staged.thread);
      result.ops.push(...staged.ops);
    }
    return result;
  }
}

const groupByAccount = (threads: readonly ThreadSummary[]): Map<AccountId, ThreadSummary[]> => {
  const groups = new Map<AccountId, ThreadSummary[]>();
  for (const thread of threads) {
    const group = groups.get(thread.accountId) ?? [];
    group.push(thread);
    groups.set(thread.accountId, group);
  }
  return groups;
};
