import {
  type AccountId,
  api,
  type DraftId,
  type ScheduledSendId,
  type TaskId,
  type ThreadId,
} from '@relay/shared';
import { EventBus } from '../event-bus';
import type { MailClient, MailEventListener } from '../MailClient';
import type { HttpApi } from './HttpApi';
import { RealtimeConnection, type RealtimeStatus, type SocketLike } from './RealtimeConnection';
import { RemoteAiRuns } from './RemoteAiRuns';
import { createRemoteCalendarClient } from './remote-calendar-client';
import { createRemoteGoogleCalendarClient } from './remote-google-calendar-client';
import type { CalendarClient } from '../CalendarClient';
import type { GoogleCalendarClient } from '../GoogleCalendarClient';

export interface RemoteMailClientOptions {
  readonly http: HttpApi;
  readonly createSocket?: (url: string) => SocketLike;
  readonly onRealtimeStatus?: (status: RealtimeStatus) => void;
  readonly reconnectDelayMs?: number;
}

type RemoteMailMethods = Omit<
  MailClient,
  | 'kind'
  | 'subscribe'
  | 'onRealtimeConnected'
  | 'dispose'
  | 'runAi'
  | keyof CalendarClient
  | keyof GoogleCalendarClient
>;

const remoteMethods = (http: HttpApi): RemoteMailMethods => ({
  listThreads: (query) => http.call(api.threads.list, { query }),
  getThread: (id: ThreadId) => http.call(api.threads.get, { params: { id } }),
  prepareThreadAi: (id, timeZone) =>
    http.call(api.threads.prepareAi, { params: { id }, query: { timeZone } }),
  requestThreadSummary: (id, timeZone) =>
    http.call(api.threads.requestSummary, { params: { id }, query: { timeZone } }),
  applyThreadAction: (id, body) => http.call(api.threads.action, { params: { id }, body }),
  getUnsubscribeOptions: (id) => http.call(api.threads.unsubscribeOptions, { params: { id } }),
  unsubscribe: async (id, url) => {
    await http.call(api.threads.unsubscribe, { params: { id }, body: { url } });
  },
  listLabels: (accountId) => http.call(api.labels.list, { query: { accountId } }),
  downloadAttachment: (id) => http.download(api.attachments.content, { params: { id } }),
  listAccounts: () => http.call(api.accounts.list, {}),
  listMailboxes: (id) => http.call(api.accounts.mailboxes, { params: { id } }),
  createAccount: (body) => http.call(api.accounts.create, { body }),
  updateAccount: (id: AccountId, body) => http.call(api.accounts.update, { params: { id }, body }),
  removeAccount: async (id) => {
    await http.call(api.accounts.remove, { params: { id } });
  },
  testConnection: (body) => http.call(api.accounts.testConnection, { body }),
  syncNow: async (accountId) => {
    await http.call(api.sync.now, { body: accountId === undefined ? {} : { accountId } });
  },
  listDrafts: () => http.call(api.compose.listDrafts, {}),
  createDraft: (body) => http.call(api.compose.createDraft, { body }),
  updateDraft: (id: DraftId, body) => http.call(api.compose.updateDraft, { params: { id }, body }),
  deleteDraft: async (id) => {
    await http.call(api.compose.deleteDraft, { params: { id } });
  },
  addDraftAttachment: (id, file) =>
    http.upload(
      api.draftAttachments.add,
      { params: { id }, query: { filename: file.filename, contentType: file.contentType } },
      file.blob,
    ),
  removeDraftAttachment: (id, attachmentId) =>
    http.call(api.draftAttachments.remove, { params: { id, attachmentId } }),
  forwardAttachments: (id, messageId) =>
    http.call(api.draftAttachments.forward, { params: { id }, body: { messageId } }),
  send: (body) => http.call(api.compose.send, { body }),
  listScheduled: () => http.call(api.compose.listScheduled, {}),
  cancelScheduled: async (id: ScheduledSendId) => {
    await http.call(api.compose.cancelScheduled, { params: { id } });
  },
  listSplits: () => http.call(api.splits.list, {}),
  replaceSplits: (splits) => http.call(api.splits.replace, { body: { splits } }),
  listAutomations: () => http.call(api.automations.list, {}),
  replaceAutomations: (automations) =>
    http.call(api.automations.replace, { body: { automations } }),
  listTasks: (query) => http.call(api.tasks.list, { query }),
  updateTask: (id: TaskId, body) => http.call(api.tasks.update, { params: { id }, body }),
  updateChecklistItem: (id, body) =>
    http.call(api.threads.updateChecklist, { params: { id }, body }),
  getSettings: () => http.call(api.settings.get, {}),
  updateSettings: (body) => http.call(api.settings.update, { body }),
  listAiRunners: () => http.call(api.ai.runners, {}),
  getAiJob: (id) => http.call(api.ai.getJob, { params: { id } }),
});

export const createRemoteMailClient = (options: RemoteMailClientOptions): MailClient => {
  const { http } = options;
  const bus = new EventBus<Parameters<MailEventListener>[0]>();
  const connections = new EventBus<undefined>();
  const aiRuns = new RemoteAiRuns(http);
  const realtime = new RealtimeConnection({
    baseUrl: http.baseUrl,
    accessToken: () => http.accessToken(),
    renewToken: (rejected) => http.renewAccessToken(rejected),
    createSocket: options.createSocket,
    onStatus: options.onRealtimeStatus,
    onConnected: () => {
      connections.emit(undefined);
    },
    minDelayMs: options.reconnectDelayMs,
    onEvent: (event) => {
      if (event.type === 'ai.job.updated') {
        aiRuns.update(event.data.job);
      }
      bus.emit(event);
    },
  });
  realtime.start();
  return {
    kind: 'remote',
    ...remoteMethods(http),
    ...createRemoteCalendarClient(http),
    ...createRemoteGoogleCalendarClient(http),
    runAi: (request, listener) => aiRuns.start(request, listener),
    subscribe: (listener) => bus.subscribe(listener),
    onRealtimeConnected: (listener) =>
      connections.subscribe(() => {
        listener();
      }),
    dispose: () => {
      realtime.stop();
      aiRuns.stopAll();
      bus.clear();
      connections.clear();
    },
  };
};
