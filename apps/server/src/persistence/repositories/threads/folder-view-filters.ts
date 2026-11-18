import { type FolderView, HELD_THREAD_STATES } from '@relay/shared/domain';
import { notInArray, type SQL, sql } from 'drizzle-orm';
import {
  drafts,
  mailboxes,
  messages,
  scheduledSends,
  splits,
  tasks,
  threadSplits,
  threads,
} from '../../schema';

const notHeld = notInArray(threads.state, [...HELD_THREAD_STATES]);

const outsideExclusiveSplits = sql`not exists(
  select 1 from ${threadSplits}
  join ${splits} on ${splits.id} = ${threadSplits.splitId}
  where ${threadSplits.threadId} = ${threads.id} and ${splits.exclusive}
)`;

export const hasOpenTask = sql`exists(
  select 1 from ${tasks}
  where ${tasks.threadId} = ${threads.id} and ${tasks.state} <> 'done'
)`;

const hasSentMessage = sql`exists(
  select 1 from ${messages}
  join ${mailboxes} on ${mailboxes.id} = ${messages.mailboxId}
  where ${messages.threadId} = ${threads.id} and ${mailboxes.role} = 'sent'
)`;

const hasDraft = sql`exists(
  select 1 from ${drafts} where ${drafts.inReplyToThreadId} = ${threads.id}
)`;

const hasActiveScheduledSend = sql`exists(
  select 1 from ${scheduledSends}
  join ${drafts} on ${drafts.id} = ${scheduledSends.draftId}
  where ${drafts.inReplyToThreadId} = ${threads.id} and ${scheduledSends.status} in ('pending', 'sending')
)`;

export interface FolderViewFilterInput {
  readonly view: FolderView;
  readonly splitSelected: boolean;
}

const FOLDER_VIEW_FILTERS: Readonly<Record<FolderView, (input: FolderViewFilterInput) => SQL>> = {
  inbox: (input) =>
    input.splitSelected
      ? sql`${threads.state} = 'inbox'`
      : sql`${threads.state} = 'inbox' and ${outsideExclusiveSplits}`,
  done: () => sql`${threads.state} = 'done'`,
  trash: () => sql`${threads.state} = 'trash'`,
  spam: () => sql`${threads.state} = 'spam'`,
  reminders: () => sql`${threads.state} = 'reminder'`,
  tasks: () => sql`${notHeld} and ${hasOpenTask}`,
  sent: () => sql`${notHeld} and ${hasSentMessage}`,
  drafts: () => sql`${notHeld} and ${hasDraft}`,
  scheduled: () => sql`${notHeld} and ${hasActiveScheduledSend}`,
  mailbox: () => notHeld,
  label: () => notHeld,
};

export const folderViewFilter = (input: FolderViewFilterInput): SQL =>
  FOLDER_VIEW_FILTERS[input.view](input);
