import {
  type FolderView,
  isHeldThreadState,
  type LabelId,
  type MailboxRole,
  type ThreadAction,
  type ThreadSummary,
} from '@relay/shared';
import type { ThreadListParams } from './MailClient';

export interface ProjectionHint {
  readonly targetRole?: MailboxRole;
  readonly labelId?: LabelId;
}

const projectMove = (thread: ThreadSummary, hint: ProjectionHint): ThreadSummary => ({
  ...thread,
  state: hint.targetRole === 'inbox' ? 'inbox' : 'done',
  remindAt: null,
  labelIds:
    hint.labelId === undefined ? thread.labelIds : [...new Set([...thread.labelIds, hint.labelId])],
});

export const projectThreadAction = (
  thread: ThreadSummary,
  action: ThreadAction,
  hint: ProjectionHint = {},
): ThreadSummary => {
  if (action.type === 'move') {
    return projectMove(thread, hint);
  }
  if (action.type === 'undoMove') {
    return thread;
  }
  if (action.type === 'done') {
    return { ...thread, state: 'done', unread: false, remindAt: null };
  }
  if (
    action.type === 'undone' ||
    action.type === 'restore' ||
    action.type === 'notSpam' ||
    action.type === 'cancelReminder'
  ) {
    return { ...thread, state: 'inbox', remindAt: null };
  }
  if (action.type === 'trash') {
    return { ...thread, state: 'trash', unread: false };
  }
  if (action.type === 'reportSpam') {
    return { ...thread, state: 'spam' };
  }
  if (action.type === 'markRead' || action.type === 'markUnread') {
    return { ...thread, unread: action.type === 'markUnread' };
  }
  if (action.type === 'remind') {
    return { ...thread, state: 'reminder', remindAt: action.at, unread: false };
  }
  if (action.type === 'addLabel') {
    return { ...thread, labelIds: [...new Set([...thread.labelIds, action.labelId])] };
  }
  return { ...thread, labelIds: thread.labelIds.filter((id) => id !== action.labelId) };
};

export const staysInView = (view: FolderView, thread: ThreadSummary): boolean => {
  if (view === 'inbox' || view === 'tasks') {
    return thread.state === 'inbox';
  }
  if (view === 'reminders') {
    return thread.state === 'reminder';
  }
  if (view === 'done' || view === 'trash' || view === 'spam') {
    return thread.state === view;
  }
  return !isHeldThreadState(thread.state);
};

export const matchesListParams = (params: ThreadListParams, thread: ThreadSummary): boolean =>
  staysInView(params.view, thread) &&
  (params.labelId === undefined || thread.labelIds.includes(params.labelId)) &&
  (params.splitId === undefined || thread.splitIds.includes(params.splitId)) &&
  (params.accountId === undefined || thread.accountId === params.accountId);
