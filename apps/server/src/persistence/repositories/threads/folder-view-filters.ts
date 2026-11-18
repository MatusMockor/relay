import type { FolderView } from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
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

const notTrashed = sql`${threads.state} <> 'trash'`;

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
  reminders: () => sql`${threads.state} = 'reminder'`,
  tasks: () => sql`${notTrashed} and ${hasOpenTask}`,
  sent: () => sql`${notTrashed} and ${hasSentMessage}`,
  drafts: () => sql`${notTrashed} and ${hasDraft}`,
  scheduled: () => sql`${notTrashed} and ${hasActiveScheduledSend}`,
};

export const folderViewFilter = (input: FolderViewFilterInput): SQL =>
  FOLDER_VIEW_FILTERS[input.view](input);
