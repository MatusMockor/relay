import type { ThreadId } from '@relay/shared/domain';
import type { ThreadRefreshWork } from '../../model/pending-work';
import type { MailCopies } from '../shared/mail-copies';
import type { ThreadRefreshHint } from '../shared/thread-refresh';
import { type MessageRoleOf, syncedThreadState } from './synced-thread-state';

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
  roleOf: MessageRoleOf,
  copies: MailCopies,
): ThreadRefreshHint => ({
  addSplitIds: [...work.addSplitIds],
  ...(work.jiraKey === null ? {} : { jiraKey: work.jiraKey }),
  ...(work.jiraActor === null ? {} : { jiraActor: work.jiraActor }),
  resolveState: (existing, messages) => syncedThreadState(work, existing, messages, roleOf, copies),
});
