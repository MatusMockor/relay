import { type FolderView, HELD_THREAD_STATES } from '@relay/shared/domain';
import { and, eq, notInArray, type SQL, sql } from 'drizzle-orm';
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

export const notHeld = notInArray(threads.state, [...HELD_THREAD_STATES]);

const withoutExclusiveSplits = sql`not exists (select 1 from ${threadSplits} inner join ${splits} on ${splits.id} = ${threadSplits.splitId} where ${threadSplits.threadId} = ${threads.id} and ${splits.exclusive} = 1)`;

export const hasOpenTask = sql`exists (select 1 from ${tasks} where ${tasks.threadId} = ${threads.id} and ${tasks.userId} = ${threads.userId} and ${tasks.state} <> 'done')`;

const hasSentMessage = sql`exists (select 1 from ${messages} inner join ${mailboxes} on ${mailboxes.id} = ${messages.mailboxId} where ${messages.threadId} = ${threads.id} and ${mailboxes.role} = 'sent')`;

const hasDraftRow = sql`exists (select 1 from ${drafts} where ${drafts.inReplyToThreadId} = ${threads.id} and ${drafts.userId} = ${threads.userId})`;

const hasScheduledSend = sql`exists (select 1 from ${scheduledSends} inner join ${drafts} on ${drafts.id} = ${scheduledSends.draftId} where ${drafts.inReplyToThreadId} = ${threads.id} and ${scheduledSends.userId} = ${threads.userId} and ${scheduledSends.status} in ('pending', 'sending'))`;

export interface FolderViewConditionInput {
  readonly view: FolderView;
  readonly splitSelected: boolean;
  readonly searching: boolean;
}

const inboxCondition = (input: FolderViewConditionInput): SQL | undefined => {
  if (input.splitSelected || input.searching) {
    return eq(threads.state, 'inbox');
  }
  return and(eq(threads.state, 'inbox'), withoutExclusiveSplits);
};

export const folderViewCondition = (input: FolderViewConditionInput): SQL | undefined => {
  switch (input.view) {
    case 'inbox':
      return inboxCondition(input);
    case 'done':
      return eq(threads.state, 'done');
    case 'trash':
      return eq(threads.state, 'trash');
    case 'spam':
      return eq(threads.state, 'spam');
    case 'reminders':
      return eq(threads.state, 'reminder');
    case 'tasks':
      return and(notHeld, hasOpenTask);
    case 'sent':
      return and(notHeld, hasSentMessage);
    case 'drafts':
      return and(notHeld, hasDraftRow);
    case 'scheduled':
      return and(notHeld, hasScheduledSend);
    case 'mailbox':
    case 'label':
      return notHeld;
  }
};
