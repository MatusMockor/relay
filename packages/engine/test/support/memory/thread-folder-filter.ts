import {
  type FolderView,
  isHeldThreadState,
  type MailboxId,
  type SplitId,
  type ThreadSummary,
  type UserId,
} from '@relay/shared/domain';
import type { ThreadFolderQuery } from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { hasSearchTerms, ThreadSearchMatch } from './thread-search-match';

const unheld = (thread: ThreadSummary): boolean => !isHeldThreadState(thread.state);

type ViewPredicate = (userId: UserId, thread: ThreadSummary, query: ThreadFolderQuery) => boolean;

export class ThreadFolderFilter {
  private readonly views: Record<FolderView, ViewPredicate>;
  private readonly search: ThreadSearchMatch;

  constructor(private readonly db: MemoryDatabase) {
    this.search = new ThreadSearchMatch(db);
    this.views = {
      inbox: (userId, thread, query) =>
        thread.state === 'inbox' &&
        (query.splitId !== null || hasSearchTerms(query) || !this.inExclusiveSplit(userId, thread)),
      done: (_userId, thread) => thread.state === 'done' && thread.markedDone === true,
      archive: (_userId, thread) => thread.state === 'done' && thread.markedDone !== true,
      trash: (_userId, thread) => thread.state === 'trash',
      spam: (_userId, thread) => thread.state === 'spam',
      reminders: (_userId, thread) => thread.state === 'reminder',
      tasks: (_userId, thread) => unheld(thread) && this.hasOpenTask(thread),
      sent: (_userId, thread) => unheld(thread) && this.hasSentMessage(thread),
      drafts: (_userId, thread) => unheld(thread) && thread.hasDraft,
      scheduled: (_userId, thread) => unheld(thread) && this.hasScheduledSend(thread),
      mailbox: (_userId, thread) => unheld(thread),
      label: (_userId, thread) => unheld(thread),
    };
  }

  matches(userId: UserId, thread: ThreadSummary, query: ThreadFolderQuery): boolean {
    if (!this.db.ownsAccount(userId, thread.accountId)) {
      return false;
    }
    if (query.accountId !== null && thread.accountId !== query.accountId) {
      return false;
    }
    if (query.unread === true && !thread.unread) {
      return false;
    }
    if (!this.search.matches(thread, query)) {
      return false;
    }
    if (query.everywhere === true) {
      return unheld(thread);
    }
    return this.inScope(userId, thread, query);
  }

  private inScope(userId: UserId, thread: ThreadSummary, query: ThreadFolderQuery): boolean {
    if (query.splitId !== null && !this.visibleInSplit(userId, thread, query.splitId)) {
      return false;
    }
    if (query.labelId !== null && !thread.labelIds.includes(query.labelId)) {
      return false;
    }
    if (query.mailboxId !== null && !this.hasMessageIn(thread, query.mailboxId)) {
      return false;
    }
    return this.views[query.view](userId, thread, query);
  }

  private inExclusiveSplit(userId: UserId, thread: ThreadSummary): boolean {
    const splits = this.db.tables.splits.get(userId) ?? [];
    return splits.some((split) => split.exclusive && thread.splitIds.includes(split.id));
  }

  private visibleInSplit(userId: UserId, thread: ThreadSummary, splitId: SplitId): boolean {
    if (!thread.splitIds.includes(splitId)) {
      return false;
    }
    const split = (this.db.tables.splits.get(userId) ?? []).find((item) => item.id === splitId);
    return split?.hideTasks !== true || !this.hasOpenTask(thread);
  }

  private hasOpenTask(thread: ThreadSummary): boolean {
    return [...this.db.tables.tasks.values()].some(
      (task) => task.threadId === thread.id && task.state !== 'done',
    );
  }

  private hasSentMessage(thread: ThreadSummary): boolean {
    return [...this.db.tables.messages.values()].some(
      (message) =>
        message.threadId === thread.id &&
        this.db.tables.mailboxes.get(message.mailboxId)?.role === 'sent',
    );
  }

  private hasMessageIn(thread: ThreadSummary, mailboxId: MailboxId): boolean {
    return [...this.db.tables.messages.values()].some(
      (message) => message.threadId === thread.id && message.mailboxId === mailboxId,
    );
  }

  private hasScheduledSend(thread: ThreadSummary): boolean {
    return [...this.db.tables.scheduledSends.values()].some(
      (scheduled) =>
        scheduled.status === 'pending' &&
        this.db.tables.drafts.get(scheduled.draftId)?.draft.inReplyToThreadId === thread.id,
    );
  }
}
