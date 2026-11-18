import type { RealtimeEvent, ThreadDetail } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { applyAiJobUpdate } from './ai-job-cache';
import { calendarKeys } from './calendar-keys';
import { invalidateBatched } from './invalidation-batch';
import { queryKeys } from './query-keys';
import { removeThreadFromLists, writeThreadToLists } from './thread-cache';

const invalidate = (client: QueryClient, key: readonly unknown[]) => {
  invalidateBatched(client, key);
};

export const applyRealtimeEvent = (client: QueryClient, event: RealtimeEvent): void => {
  if (event.type === 'thread.upserted') {
    writeThreadToLists(client, event.data.thread);
    client.setQueryData<ThreadDetail>(queryKeys.thread(event.data.thread.id), (detail) =>
      detail === undefined ? detail : { ...detail, thread: event.data.thread },
    );
    invalidate(client, queryKeys.threadLists());
    return;
  }
  if (event.type === 'thread.removed') {
    removeThreadFromLists(client, event.data.threadId);
    return;
  }
  if (event.type === 'message.upserted') {
    invalidate(client, queryKeys.thread(event.data.message.threadId));
    return;
  }
  if (event.type === 'ai.job.updated') {
    applyAiJobUpdate(client, event.data.job);
    return;
  }
  if (event.type === 'settings.updated') {
    client.setQueryData(queryKeys.settings(), event.data.settings);
    return;
  }
  if (event.type === 'splits.updated') {
    client.setQueryData(queryKeys.splits(), event.data.splits);
    invalidate(client, queryKeys.threadLists());
    return;
  }
  if (event.type === 'automations.updated') {
    client.setQueryData(queryKeys.automations(), event.data.automations);
    return;
  }
  if (event.type === 'mailboxes.updated') {
    client.setQueryData(queryKeys.mailboxes(event.data.accountId), event.data.mailboxes);
    return;
  }
  if (event.type === 'labels.updated') {
    invalidate(client, queryKeys.labels());
    return;
  }
  if (event.type === 'calendar.updated') {
    invalidate(client, calendarKeys.all());
    return;
  }
  if (event.type === 'task.upserted') {
    invalidate(client, queryKeys.taskLists());
    invalidate(client, queryKeys.threadLists());
    return;
  }
  if (event.type === 'draft.upserted' || event.type === 'draft.removed') {
    invalidate(client, queryKeys.drafts());
    return;
  }
  if (event.type === 'scheduledSend.upserted') {
    invalidate(client, queryKeys.scheduled());
    return;
  }
  if (
    event.type === 'account.upserted' ||
    event.type === 'account.removed' ||
    event.type === 'account.status'
  ) {
    invalidate(client, queryKeys.accounts());
    if (event.type === 'account.removed') {
      invalidate(client, queryKeys.allMailboxes());
      invalidate(client, calendarKeys.all());
      invalidate(client, queryKeys.threadLists());
    }
  }
};
