import type { FolderView, ThreadAction, ThreadSummary } from '@relay/shared';

export const projectThreadAction = (thread: ThreadSummary, action: ThreadAction): ThreadSummary => {
  if (action.type === 'done') {
    return { ...thread, state: 'done', unread: false, remindAt: null };
  }
  if (action.type === 'undone' || action.type === 'restore' || action.type === 'cancelReminder') {
    return { ...thread, state: 'inbox', remindAt: null };
  }
  if (action.type === 'trash') {
    return { ...thread, state: 'trash', unread: false };
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
  if (view === 'done' || view === 'trash') {
    return thread.state === view;
  }
  return thread.state !== 'trash';
};
