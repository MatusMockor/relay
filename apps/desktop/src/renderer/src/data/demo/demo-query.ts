import {
  isHeldThreadState,
  type SplitId,
  type ThreadId,
  type ThreadPage,
  type ThreadSummary,
} from '@relay/shared';
import type { ThreadListParams } from '../MailClient';
import { isDemoSearching, matchesDemoSearch } from './demo-search-match';
import type { DemoState, DemoThreadRecord } from './demo-state';

const ownEmails = (state: DemoState): Set<string> =>
  new Set(state.accounts.map((account) => account.email));

const hasOpenTask = (state: DemoState, threadId: ThreadId): boolean =>
  state.tasks.some((task) => task.threadId === threadId && task.state !== 'done');

const inSplit = (state: DemoState, thread: ThreadSummary, splitId: SplitId): boolean => {
  const hidesTasks = state.splits.some((split) => split.id === splitId && split.hideTasks);
  return thread.splitIds.includes(splitId) && !(hidesTasks && hasOpenTask(state, thread.id));
};

const inInbox = (state: DemoState, thread: ThreadSummary, params: ThreadListParams): boolean => {
  if (params.labelId !== undefined) {
    return thread.labelIds.includes(params.labelId);
  }
  if (params.splitId !== undefined) {
    return inSplit(state, thread, params.splitId);
  }
  if (isDemoSearching(params.q)) {
    return true;
  }
  return thread.splitIds.length === 0;
};

const inView = (state: DemoState, record: DemoThreadRecord, params: ThreadListParams): boolean => {
  const thread = record.summary;
  if (params.view === 'inbox') {
    return thread.state === 'inbox' && inInbox(state, thread, params);
  }
  if (params.view === 'tasks') {
    return thread.state === 'inbox' && hasOpenTask(state, thread.id);
  }
  if (params.view === 'reminders') {
    return thread.state === 'reminder';
  }
  if (params.view === 'sent') {
    const own = ownEmails(state);
    return (
      !isHeldThreadState(thread.state) &&
      record.messages.some((message) => own.has(message.from?.email ?? ''))
    );
  }
  if (params.view === 'drafts') {
    return thread.hasDraft && !isHeldThreadState(thread.state);
  }
  if (params.view === 'scheduled') {
    return false;
  }
  if (params.view === 'mailbox') {
    return (
      !isHeldThreadState(thread.state) &&
      record.messages.some((message) => message.mailboxId === params.mailboxId)
    );
  }
  if (params.view === 'label') {
    return (
      !isHeldThreadState(thread.state) &&
      params.labelId !== undefined &&
      thread.labelIds.includes(params.labelId)
    );
  }
  return thread.state === params.view;
};

const inScope = (state: DemoState, record: DemoThreadRecord, params: ThreadListParams): boolean =>
  params.everywhere === true
    ? !isHeldThreadState(record.summary.state)
    : inView(state, record, params);

const sortFor = (view: ThreadListParams['view']) => (a: ThreadSummary, b: ThreadSummary) => {
  if (view === 'reminders') {
    return Date.parse(a.remindAt ?? a.lastMessageAt) - Date.parse(b.remindAt ?? b.lastMessageAt);
  }
  return Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);
};

export const queryThreads = (state: DemoState, params: ThreadListParams): ThreadPage => {
  const items = [...state.threads.values()]
    .filter(
      (record) => params.accountId === undefined || record.summary.accountId === params.accountId,
    )
    .filter((record) => inScope(state, record, params))
    .filter((record) => matchesDemoSearch(record, params))
    .map((record) => record.summary)
    .sort(sortFor(params.view));
  const offset = params.cursor === undefined ? 0 : Number(params.cursor);
  const limit = params.limit ?? 50;
  const page = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? String(offset + limit) : null;
  return { items: page, nextCursor: next };
};
