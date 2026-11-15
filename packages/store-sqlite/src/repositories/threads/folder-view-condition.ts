import type { FolderView } from '@relay/shared/domain';
import { and, eq, ne, type SQL, sql } from 'drizzle-orm';
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

const notTrashed = ne(threads.state, 'trash');

const withoutExclusiveSplits = sql`not exists (select 1 from ${threadSplits} inner join ${splits} on ${splits.id} = ${threadSplits.splitId} where ${threadSplits.threadId} = ${threads.id} and ${splits.exclusive} = 1)`;

const hasOpenTask = sql`exists (select 1 from ${tasks} where ${tasks.threadId} = ${threads.id} and ${tasks.userId} = ${threads.userId} and ${tasks.state} <> 'done')`;

const hasSentMessage = sql`exists (select 1 from ${messages} inner join ${mailboxes} on ${mailboxes.id} = ${messages.mailboxId} where ${messages.threadId} = ${threads.id} and ${mailboxes.role} = 'sent')`;

const hasDraftRow = sql`exists (select 1 from ${drafts} where ${drafts.inReplyToThreadId} = ${threads.id} and ${drafts.userId} = ${threads.userId})`;

const hasScheduledSend = sql`exists (select 1 from ${scheduledSends} inner join ${drafts} on ${drafts.id} = ${scheduledSends.draftId} where ${drafts.inReplyToThreadId} = ${threads.id} and ${scheduledSends.userId} = ${threads.userId} and ${scheduledSends.status} in ('pending', 'sending'))`;

export const folderViewCondition = (view: FolderView, splitSelected: boolean): SQL | undefined => {
  switch (view) {
    case 'inbox':
      return splitSelected
        ? eq(threads.state, 'inbox')
        : and(eq(threads.state, 'inbox'), withoutExclusiveSplits);
    case 'done':
      return eq(threads.state, 'done');
    case 'trash':
      return eq(threads.state, 'trash');
    case 'reminders':
      return eq(threads.state, 'reminder');
    case 'tasks':
      return and(notTrashed, hasOpenTask);
    case 'sent':
      return and(notTrashed, hasSentMessage);
    case 'drafts':
      return and(notTrashed, hasDraftRow);
    case 'scheduled':
      return and(notTrashed, hasScheduledSend);
  }
};
