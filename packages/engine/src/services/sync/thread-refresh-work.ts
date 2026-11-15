import type {
  MailboxId,
  Message,
  ThreadId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import type { ThreadRefreshWork } from '../../model/pending-work';
import type { ThreadRefreshHint } from '../shared/thread-refresh';

export const emptyThreadWork = (threadId: ThreadId): ThreadRefreshWork => ({
  threadId,
  addSplitIds: [],
  arrivedIn: [],
  jiraKey: null,
  jiraActor: null,
  expungedFromInbox: false,
});

export const mergeThreadWork = (
  current: ThreadRefreshWork,
  change: Partial<ThreadRefreshWork>,
): ThreadRefreshWork => ({
  threadId: current.threadId,
  addSplitIds: [...new Set([...current.addSplitIds, ...(change.addSplitIds ?? [])])],
  arrivedIn: [...new Set([...current.arrivedIn, ...(change.arrivedIn ?? [])])],
  jiraKey: change.jiraKey ?? current.jiraKey,
  jiraActor: change.jiraActor ?? current.jiraActor,
  expungedFromInbox: current.expungedFromInbox || (change.expungedFromInbox ?? false),
});

export const threadWorkHint = (
  work: ThreadRefreshWork,
  inboxIds: ReadonlySet<MailboxId>,
): ThreadRefreshHint => ({
  addSplitIds: [...work.addSplitIds],
  ...(work.jiraKey === null ? {} : { jiraKey: work.jiraKey }),
  ...(work.jiraActor === null ? {} : { jiraActor: work.jiraActor }),
  resolveState: (existing, messages) => resolveState(work, existing, messages, inboxIds),
});

const resolveState = (
  work: ThreadRefreshWork,
  existing: ThreadSummary | null,
  messages: readonly Message[],
  inboxIds: ReadonlySet<MailboxId>,
): ThreadState => {
  const stillInInbox = messages.some((message) => inboxIds.has(message.mailboxId));
  if (work.arrivedIn.includes('inbox') && stillInInbox) {
    return 'inbox';
  }
  if (existing === null) {
    return work.arrivedIn.length > 0 && work.arrivedIn.every((role) => role === 'trash')
      ? 'trash'
      : 'done';
  }
  if (work.expungedFromInbox && existing.state === 'inbox' && !stillInInbox) {
    return 'done';
  }
  return existing.state;
};
