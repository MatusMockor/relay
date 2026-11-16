import type { IpcResult, RealtimeEvent, RelayBridge } from '@relay/shared';
import { EventBus } from '../event-bus';
import { MailClientError } from '../errors';
import type { MailClient } from '../MailClient';
import { attachmentFileOf } from './attachment-file';
import { createLocalCalendarClient } from './local-calendar-client';
import { createLocalGoogleCalendarClient } from './local-google-calendar-client';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

const ignore = async (result: Promise<IpcResult<unknown>>): Promise<void> => {
  await unwrap(result);
};

export const createLocalMailClient = (bridge: RelayBridge): MailClient => {
  const bus = new EventBus<RealtimeEvent>();
  const stopEvents = bridge.subscribe('local.events', {
    onEvent: (event) => {
      bus.emit(event);
    },
  });
  return {
    kind: 'local',
    ...createLocalCalendarClient(bridge),
    ...createLocalGoogleCalendarClient(bridge),
    listThreads: (query) => unwrap(bridge.invoke('local.threads.list', query)),
    getThread: (threadId) => unwrap(bridge.invoke('local.threads.get', { threadId })),
    prepareThreadAi: (threadId, timeZone) =>
      unwrap(bridge.invoke('local.threads.prepareAi', { threadId, timeZone })),
    applyThreadAction: (threadId, action) =>
      unwrap(bridge.invoke('local.threads.action', { threadId, action })),
    listLabels: (accountId) => unwrap(bridge.invoke('local.labels.list', { accountId })),
    downloadAttachment: async (attachmentId) =>
      attachmentFileOf(await unwrap(bridge.invoke('local.attachments.content', { attachmentId }))),
    listAccounts: () => unwrap(bridge.invoke('local.accounts.list')),
    createAccount: (body) => unwrap(bridge.invoke('local.accounts.create', body)),
    updateAccount: (accountId, patch) =>
      unwrap(bridge.invoke('local.accounts.update', { accountId, patch })),
    removeAccount: (accountId) => ignore(bridge.invoke('local.accounts.delete', { accountId })),
    testConnection: (body) => unwrap(bridge.invoke('local.accounts.testConnection', body)),
    syncNow: (accountId) => ignore(bridge.invoke('local.sync.now', { accountId })),
    listDrafts: () => unwrap(bridge.invoke('local.drafts.list')),
    createDraft: (content) => unwrap(bridge.invoke('local.drafts.create', content)),
    updateDraft: (draftId, patch) =>
      unwrap(bridge.invoke('local.drafts.update', { draftId, patch })),
    deleteDraft: (draftId) => ignore(bridge.invoke('local.drafts.delete', { draftId })),
    addDraftAttachment: async (draftId, file) =>
      unwrap(
        bridge.invoke('local.drafts.attachments.add', {
          draftId,
          filename: file.filename,
          contentType: file.contentType,
          content: new Uint8Array(await file.blob.arrayBuffer()),
        }),
      ),
    removeDraftAttachment: (draftId, attachmentId) =>
      unwrap(bridge.invoke('local.drafts.attachments.remove', { draftId, attachmentId })),
    forwardAttachments: (draftId, messageId) =>
      unwrap(bridge.invoke('local.drafts.attachments.forward', { draftId, messageId })),
    send: (body) => unwrap(bridge.invoke('local.send', body)),
    listScheduled: () => unwrap(bridge.invoke('local.scheduled.list')),
    cancelScheduled: (scheduledSendId) =>
      ignore(bridge.invoke('local.scheduled.cancel', { scheduledSendId })),
    listSplits: () => unwrap(bridge.invoke('local.splits.list')),
    replaceSplits: (splits) => unwrap(bridge.invoke('local.splits.replace', { splits })),
    listTasks: (query) => unwrap(bridge.invoke('local.tasks.list', query)),
    updateTask: (taskId, patch) => unwrap(bridge.invoke('local.tasks.update', { taskId, patch })),
    updateChecklistItem: (threadId, item) =>
      unwrap(bridge.invoke('local.threads.updateChecklist', { threadId, item })),
    getSettings: () => unwrap(bridge.invoke('local.settings.get')),
    updateSettings: (patch) => unwrap(bridge.invoke('local.settings.update', patch)),
    listAiRunners: () => unwrap(bridge.invoke('ai.detectRunners')),
    getAiJob: (jobId) => unwrap(bridge.invoke('local.ai.getJob', { jobId })),
    runAi: (request, listener) =>
      bridge.subscribe(
        'ai.run',
        {
          onEvent: listener,
          onError: (error) => {
            listener({ type: 'failed', code: 'process_failed', message: error.message });
          },
        },
        request,
      ),
    subscribe: (listener) => bus.subscribe(listener),
    onRealtimeConnected: () => () => undefined,
    dispose: () => {
      stopEvents();
      bus.clear();
    },
  };
};
