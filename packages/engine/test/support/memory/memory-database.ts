import type {
  AccountId,
  AiJob,
  AiJobId,
  AiResult,
  Draft,
  DraftId,
  Label,
  LabelId,
  MailAccount,
  Mailbox,
  MailboxId,
  Message,
  MessageId,
  Reminder,
  ReminderId,
  ScheduledSend,
  ScheduledSendId,
  Split,
  Task,
  TaskId,
  ThreadId,
  ThreadSummary,
  UserId,
  UserSettings,
} from '@relay/shared/domain';
import type { MailboxSyncState, MessageHeaders, PendingWork } from '../../../src';

export interface StoredDraft {
  readonly userId: UserId;
  readonly draft: Draft;
}

export class MemoryTables {
  readonly accounts = new Map<AccountId, MailAccount>();
  readonly mailboxes = new Map<MailboxId, Mailbox>();
  readonly messages = new Map<MessageId, Message>();
  readonly messageHeaders = new Map<MessageId, MessageHeaders>();
  readonly threads = new Map<ThreadId, ThreadSummary>();
  readonly labels = new Map<LabelId, Label>();
  readonly splits = new Map<UserId, Split[]>();
  readonly tasks = new Map<TaskId, Task>();
  readonly reminders = new Map<ReminderId, Reminder>();
  readonly drafts = new Map<DraftId, StoredDraft>();
  readonly draftSendClaims = new Map<DraftId, string>();
  readonly scheduledSends = new Map<ScheduledSendId, ScheduledSend>();
  readonly scheduledSendClaims = new Map<ScheduledSendId, string>();
  readonly settings = new Map<UserId, UserSettings>();
  readonly aiResults: AiResult[] = [];
  readonly aiJobs = new Map<AiJobId, AiJob>();
  readonly aiJobLeases = new Map<AiJobId, { owner: string; leaseUntil: string }>();
  readonly unindexedAiJobs = new Set<AiJobId>();
  readonly syncStates = new Map<MailboxId, MailboxSyncState>();
  readonly pendingWork = new Map<string, PendingWork>();
}

export class MemoryDatabase {
  private current = new MemoryTables();

  get tables(): MemoryTables {
    return this.current;
  }

  snapshot(): MemoryTables {
    return Object.assign(new MemoryTables(), structuredClone(this.current));
  }

  restore(tables: MemoryTables): void {
    this.current = tables;
  }

  ownerOf(accountId: AccountId): UserId | null {
    return this.current.accounts.get(accountId)?.userId ?? null;
  }

  ownsAccount(userId: UserId, accountId: AccountId): boolean {
    return this.ownerOf(accountId) === userId;
  }
}

export const offsetPage = <Item>(
  items: readonly Item[],
  cursor: string | null,
  limit: number,
): { items: Item[]; nextCursor: string | null } => {
  const start = cursor === null ? 0 : Number(cursor);
  const slice = items.slice(start, start + limit);
  const next = start + slice.length;
  return { items: slice, nextCursor: next < items.length ? String(next) : null };
};
