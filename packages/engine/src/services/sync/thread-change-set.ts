import type {
  JiraKey,
  MailboxId,
  MailboxRole,
  Message,
  SplitId,
  ThreadId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import type { ThreadRefreshHint } from '../shared/thread-refresh';
import type { JiraTaskEvent } from './jira-task-sink';

interface ThreadChange {
  readonly addSplitIds: Set<SplitId>;
  readonly arrivedIn: Set<MailboxRole>;
  jiraKey: JiraKey | null;
  jiraActor: string | null;
  expungedFromInbox: boolean;
}

export interface DrainedChanges {
  readonly threads: readonly [ThreadId, ThreadChange][];
  readonly createdMessages: readonly Message[];
  readonly jiraEvents: readonly JiraTaskEvent[];
}

export class ThreadChangeSet {
  private threads = new Map<ThreadId, ThreadChange>();
  private createdMessages: Message[] = [];
  private jiraEvents: JiraTaskEvent[] = [];

  arrived(message: Message, role: MailboxRole, splitIds: readonly SplitId[]): void {
    const change = this.entry(message.threadId);
    change.arrivedIn.add(role);
    splitIds.forEach((splitId) => change.addSplitIds.add(splitId));
    this.createdMessages.push(message);
  }

  jira(event: JiraTaskEvent): void {
    const change = this.entry(event.threadId);
    change.jiraKey = event.classification.jiraKey;
    change.jiraActor = event.classification.actor ?? change.jiraActor;
    this.jiraEvents.push(event);
  }

  expunged(threadIds: readonly ThreadId[], role: MailboxRole): void {
    threadIds.forEach((threadId) => {
      const change = this.entry(threadId);
      change.expungedFromInbox = change.expungedFromInbox || role === 'inbox';
    });
  }

  touched(threadId: ThreadId): void {
    this.entry(threadId);
  }

  get size(): number {
    return this.threads.size;
  }

  drain(): DrainedChanges {
    const drained = {
      threads: [...this.threads.entries()],
      createdMessages: this.createdMessages,
      jiraEvents: this.jiraEvents,
    };
    this.threads = new Map();
    this.createdMessages = [];
    this.jiraEvents = [];
    return drained;
  }

  static hint(change: ThreadChange, inboxIds: ReadonlySet<MailboxId>): ThreadRefreshHint {
    return {
      addSplitIds: [...change.addSplitIds],
      ...(change.jiraKey === null ? {} : { jiraKey: change.jiraKey }),
      ...(change.jiraActor === null ? {} : { jiraActor: change.jiraActor }),
      resolveState: (existing, messages) => resolveState(change, existing, messages, inboxIds),
    };
  }

  private entry(threadId: ThreadId): ThreadChange {
    const known = this.threads.get(threadId);
    if (known !== undefined) {
      return known;
    }
    const created: ThreadChange = {
      addSplitIds: new Set(),
      arrivedIn: new Set(),
      jiraKey: null,
      jiraActor: null,
      expungedFromInbox: false,
    };
    this.threads.set(threadId, created);
    return created;
  }
}

const resolveState = (
  change: ThreadChange,
  existing: ThreadSummary | null,
  messages: readonly Message[],
  inboxIds: ReadonlySet<MailboxId>,
): ThreadState => {
  if (change.arrivedIn.has('inbox')) {
    return 'inbox';
  }
  if (existing === null) {
    return change.arrivedIn.size > 0 && [...change.arrivedIn].every((role) => role === 'trash')
      ? 'trash'
      : 'done';
  }
  const stillInInbox = messages.some((message) => inboxIds.has(message.mailboxId));
  if (change.expungedFromInbox && existing.state === 'inbox' && !stillInInbox) {
    return 'done';
  }
  return existing.state;
};
