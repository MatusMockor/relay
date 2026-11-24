import type { AccountId, RealtimeEvent, ThreadDetail } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { applyAiJobUpdate } from './ai-job-cache';
import { calendarKeys } from './calendar-keys';
import { invalidateBatched } from './invalidation-batch';
import { throttleByKey } from './keyed-throttle';
import { queryKeys } from './query-keys';
import { taskSystemKeys } from './task-system-keys';
import { removeThreadFromLists, writeThreadToLists } from './thread-cache';
import { settleSyncStatus } from './sync-status-cache';
import { recordSyncProgress } from './use-sync-progress';
import { recordThreadChange } from './thread-changes';

const invalidate = (client: QueryClient, key: readonly unknown[]) => {
  invalidateBatched(client, key);
};

const invalidateAccountThreads = (client: QueryClient, accountId: AccountId) => {
  client
    .getQueriesData<ThreadDetail>({ queryKey: queryKeys.threadDetails() })
    .forEach(([key, detail]) => {
      if (detail?.thread.accountId !== accountId) {
        return;
      }
      invalidate(client, key);
    });
};

export const applyRealtimeEvent = (client: QueryClient, event: RealtimeEvent): void => {
  if (event.type === 'thread.upserted') {
    recordThreadChange(client, event.data.thread.id, event.data.thread);
    writeThreadToLists(client, event.data.thread);
    client.setQueryData<ThreadDetail>(queryKeys.thread(event.data.thread.id), (detail) =>
      detail === undefined ? detail : { ...detail, thread: event.data.thread },
    );
    invalidate(client, queryKeys.threadLists());
    return;
  }
  if (event.type === 'thread.removed') {
    removeThreadFromLists(client, event.data.threadId);
    invalidate(client, queryKeys.thread(event.data.threadId));
    return;
  }
  if (event.type === 'threads.changed') {
    const { accountId } = event.data;
    throttleByKey(client, `threads.changed:${accountId}`, () => {
      invalidate(client, queryKeys.threadLists());
      invalidateAccountThreads(client, accountId);
      invalidate(client, queryKeys.offlineStats());
    });
    return;
  }
  if (event.type === 'sync.history') {
    invalidate(client, queryKeys.historyProgress());
    invalidate(client, queryKeys.offlineStats());
    return;
  }
  if (event.type === 'sync.progress') {
    recordSyncProgress(client, event.data);
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
  if (event.type === 'taskSystems.updated') {
    invalidate(client, taskSystemKeys.connections());
    invalidate(client, taskSystemKeys.tasks(event.data.connectionId));
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
    if (event.type === 'account.status') {
      settleSyncStatus(client, event.data);
      return;
    }
    invalidate(client, queryKeys.historyProgress());
    if (event.type === 'account.removed') {
      invalidate(client, queryKeys.allMailboxes());
      invalidate(client, calendarKeys.all());
      invalidate(client, queryKeys.threadLists());
      invalidateAccountThreads(client, event.data.accountId);
    }
  }
};
