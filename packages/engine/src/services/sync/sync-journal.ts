import type {
  AccountId,
  MailboxRole,
  Message,
  MessageId,
  SplitId,
  ThreadId,
} from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { JiraEventWork, ThreadRefreshWork } from '../../model/pending-work';
import type { MessageHeaders } from '../../model/split-match-subject';
import type { Clock } from '../../ports/clock';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import { emptyThreadWork, mergeThreadWork } from './thread-refresh-work';

export interface ArrivalEffects {
  readonly publish: boolean;
  readonly live: boolean;
  readonly headers: MessageHeaders;
  readonly jira: JiraClassification | null;
  readonly arrival: boolean;
}

export interface SyncJournalOptions {
  readonly quiet: boolean;
}

export class SyncJournal {
  constructor(
    private readonly accountId: AccountId,
    private readonly clock: Clock,
    private readonly options: SyncJournalOptions = { quiet: false },
  ) {}

  async arrived(
    work: PendingWorkRepository,
    message: Message,
    role: MailboxRole,
    splitIds: readonly SplitId[],
    effects: ArrivalEffects,
  ): Promise<void> {
    await this.filed(work, message, role, splitIds);
    const { arrival } = effects;
    if (!effects.publish && !arrival) {
      return;
    }
    await work.put({
      accountId: this.accountId,
      kind: 'message-effects',
      ref: message.id,
      payload: {
        messageId: message.id,
        threadId: message.threadId,
        publish: effects.publish,
        arrival,
        live: effects.live,
        jira: effects.jira,
        headers: [...effects.headers.entries()],
      },
      createdAt: this.now(),
    });
  }

  filed(
    work: PendingWorkRepository,
    message: Message,
    role: MailboxRole,
    splitIds: readonly SplitId[],
  ): Promise<void> {
    return this.thread(work, message.threadId, { arrivedIn: [role], addSplitIds: splitIds });
  }

  async jira(work: PendingWorkRepository, messageId: MessageId, event: JiraEventWork) {
    await this.thread(work, event.threadId, {
      jiraKey: event.classification.jiraKey,
      jiraActor: event.classification.actor,
    });
    await work.put({
      accountId: this.accountId,
      kind: 'jira-event',
      ref: messageId,
      payload: event,
      createdAt: this.now(),
    });
  }

  async expunged(work: PendingWorkRepository, threadIds: readonly ThreadId[], role: MailboxRole) {
    for (const threadId of new Set(threadIds)) {
      await this.thread(work, threadId, { expungedFromInbox: role === 'inbox' });
    }
  }

  touched(work: PendingWorkRepository, threadId: ThreadId): Promise<void> {
    return this.thread(work, threadId, {});
  }

  private async thread(
    work: PendingWorkRepository,
    threadId: ThreadId,
    change: Partial<ThreadRefreshWork>,
  ): Promise<void> {
    const key = { accountId: this.accountId, kind: 'thread-refresh' as const, ref: threadId };
    const stored = await work.find(key);
    const { quiet } = this.options;
    await work.put({
      ...key,
      payload: mergeThreadWork(stored?.payload ?? emptyThreadWork(threadId, quiet), {
        ...change,
        quiet,
      }),
      createdAt: stored?.createdAt ?? this.now(),
    });
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
