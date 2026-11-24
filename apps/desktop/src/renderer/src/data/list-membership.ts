import { isHeldThreadState, type ThreadSummary } from '@relay/shared';
import type { ThreadListParams } from './MailClient';

const STATE_VIEWS: Partial<Record<ThreadListParams['view'], ThreadSummary['state']>> = {
  inbox: 'inbox',
  trash: 'trash',
  spam: 'spam',
  reminders: 'reminder',
};

const leavesView = (params: ThreadListParams, thread: ThreadSummary): boolean => {
  if (params.everywhere === true) {
    return isHeldThreadState(thread.state);
  }
  if (params.view === 'done' || params.view === 'archive') {
    return thread.state !== 'done' || (thread.markedDone === true) !== (params.view === 'done');
  }
  const state = STATE_VIEWS[params.view];
  if (state !== undefined) {
    return thread.state !== state;
  }
  return isHeldThreadState(thread.state);
};

const leavesScope = (params: ThreadListParams, thread: ThreadSummary): boolean => {
  if (params.everywhere === true) {
    return false;
  }
  return (
    (params.labelId !== undefined && !thread.labelIds.includes(params.labelId)) ||
    (params.splitId !== undefined && !thread.splitIds.includes(params.splitId))
  );
};

export const leavesList = (params: ThreadListParams, thread: ThreadSummary): boolean =>
  leavesView(params, thread) ||
  leavesScope(params, thread) ||
  (params.accountId !== undefined && thread.accountId !== params.accountId) ||
  (params.unread === true && !thread.unread);
