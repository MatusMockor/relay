import type { ThreadPage, ThreadSummary } from '@relay/shared';
import { foldText } from '../../lib/text';
import type { ThreadListParams } from '../MailClient';
import type { DemoState, DemoThreadRecord } from './demo-state';

const ownEmails = (state: DemoState): Set<string> =>
  new Set(state.accounts.map((account) => account.email));

const inView = (state: DemoState, record: DemoThreadRecord, params: ThreadListParams): boolean => {
  const thread = record.summary;
  if (params.view === 'inbox') {
    if (thread.state !== 'inbox') {
      return false;
    }
    if (params.labelId !== undefined) {
      return thread.labelIds.includes(params.labelId);
    }
    return params.splitId === undefined
      ? thread.splitIds.length === 0
      : thread.splitIds.includes(params.splitId);
  }
  if (params.view === 'tasks') {
    return (
      thread.state === 'inbox' &&
      state.tasks.some((task) => task.threadId === thread.id && task.state !== 'done')
    );
  }
  if (params.view === 'reminders') {
    return thread.state === 'reminder';
  }
  if (params.view === 'sent') {
    const own = ownEmails(state);
    return (
      thread.state !== 'trash' &&
      record.messages.some((message) => own.has(message.from?.email ?? ''))
    );
  }
  if (params.view === 'drafts') {
    return thread.hasDraft && thread.state !== 'trash';
  }
  if (params.view === 'scheduled') {
    return false;
  }
  return thread.state === params.view;
};

const matchesQuery = (thread: ThreadSummary, q: string | undefined): boolean => {
  if (q === undefined || q.trim() === '') {
    return true;
  }
  const hay = foldText(
    [
      thread.subject,
      thread.snippet,
      thread.aiOneLiner ?? '',
      thread.jiraKey ?? '',
      ...thread.participants.map((p) => `${p.name ?? ''} ${p.email}`),
    ].join(' '),
  );
  return hay.includes(foldText(q.trim()));
};

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
    .filter((record) => inView(state, record, params))
    .map((record) => record.summary)
    .filter((thread) => matchesQuery(thread, params.q))
    .sort(sortFor(params.view));
  const offset = params.cursor === undefined ? 0 : Number(params.cursor);
  const limit = params.limit ?? 50;
  const page = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? String(offset + limit) : null;
  return { items: page, nextCursor: next };
};
