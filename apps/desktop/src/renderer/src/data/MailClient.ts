import type {
  AccountId,
  AiEvent,
  AiJob,
  AiJobId,
  ApplyAutomationResponse,
  AttachmentId,
  Automation,
  AutomationId,
  AutomationInput,
  ChecklistResponse,
  AiRunnerInfo,
  AiRunRequest,
  CreateAccountBody,
  CreateLabelBody,
  DraftAttachment,
  DraftAttachmentAdded,
  DraftAttachmentsForwarded,
  DraftContent,
  DraftId,
  Label,
  LabelId,
  MailAccount,
  Mailbox,
  MessageId,
  Draft,
  RealtimeEvent,
  ScheduledSend,
  ScheduledSendId,
  SendBody,
  SendResponse,
  Split,
  SplitInput,
  Task,
  TaskId,
  TaskListQuery,
  TaskPage,
  TestConnectionBody,
  TestConnectionResponse,
  ThreadAction,
  ThreadAiState,
  ThreadDetail,
  ThreadId,
  ThreadListQuery,
  ThreadPage,
  ThreadSummary,
  UpdateAccountBody,
  UpdateChecklistItemBody,
  UpdateDraftBody,
  UpdateLabelBody,
  UnsubscribeOptions,
  UnsubscribeUrl,
  UpdateTaskBody,
  UserSettings,
  UserSettingsPatch,
} from '@relay/shared';

import type { CalendarClient } from './CalendarClient';
import type { GoogleCalendarClient } from './GoogleCalendarClient';

export type MailClientKind = 'remote' | 'local' | 'demo';

export type ThreadListParams = Omit<ThreadListQuery, 'limit'> & { readonly limit?: number };
export type TaskListParams = Omit<TaskListQuery, 'limit'> & { readonly limit?: number };
export type CreateDraftInput = Omit<DraftContent, 'attachments'> & {
  readonly attachments?: DraftAttachment[];
};

export interface AttachmentUploadInput {
  readonly filename: string;
  readonly contentType: string;
  readonly blob: Blob;
}

export interface AttachmentFile {
  readonly contentType: string;
  readonly blob: Blob;
}

export type MailEventListener = (event: RealtimeEvent) => void;
export type AiEventListener = (event: AiEvent) => void;
export type Unsubscribe = () => void;

export interface ThreadReader {
  listThreads(params: ThreadListParams): Promise<ThreadPage>;
  getThread(threadId: ThreadId): Promise<ThreadDetail>;
  prepareThreadAi(threadId: ThreadId, timeZone: string): Promise<ThreadAiState>;
  requestThreadSummary(threadId: ThreadId, timeZone: string): Promise<ThreadAiState>;
  applyThreadAction(threadId: ThreadId, action: ThreadAction): Promise<ThreadSummary>;
  getUnsubscribeOptions(threadId: ThreadId): Promise<UnsubscribeOptions>;
  unsubscribe(threadId: ThreadId, confirmedUrl: UnsubscribeUrl): Promise<void>;
  listLabels(accountId?: AccountId): Promise<Label[]>;
  downloadAttachment(attachmentId: AttachmentId): Promise<AttachmentFile>;
}

export interface AccountManager {
  listAccounts(): Promise<MailAccount[]>;
  createAccount(body: CreateAccountBody): Promise<MailAccount>;
  updateAccount(accountId: AccountId, patch: UpdateAccountBody): Promise<MailAccount>;
  removeAccount(accountId: AccountId): Promise<void>;
  testConnection(body: TestConnectionBody): Promise<TestConnectionResponse>;
  listMailboxes(accountId: AccountId): Promise<Mailbox[]>;
  syncNow(accountId?: AccountId): Promise<void>;
}

export interface Composer {
  listDrafts(): Promise<Draft[]>;
  createDraft(content: CreateDraftInput): Promise<Draft>;
  updateDraft(draftId: DraftId, patch: UpdateDraftBody): Promise<Draft>;
  deleteDraft(draftId: DraftId): Promise<void>;
  addDraftAttachment(draftId: DraftId, file: AttachmentUploadInput): Promise<DraftAttachmentAdded>;
  removeDraftAttachment(draftId: DraftId, attachmentId: AttachmentId): Promise<Draft>;
  forwardAttachments(draftId: DraftId, messageId: MessageId): Promise<DraftAttachmentsForwarded>;
  send(body: SendBody): Promise<SendResponse>;
  listScheduled(): Promise<ScheduledSend[]>;
  cancelScheduled(scheduledSendId: ScheduledSendId): Promise<void>;
}

export interface Organizer {
  listSplits(): Promise<Split[]>;
  replaceSplits(splits: SplitInput[]): Promise<Split[]>;
  createLabel(body: CreateLabelBody): Promise<Label>;
  updateLabel(labelId: LabelId, patch: UpdateLabelBody): Promise<Label>;
  deleteLabel(labelId: LabelId): Promise<void>;
  listAutomations(): Promise<Automation[]>;
  replaceAutomations(automations: AutomationInput[]): Promise<Automation[]>;
  applyAutomation(automationId: AutomationId): Promise<ApplyAutomationResponse>;
  listTasks(params: TaskListParams): Promise<TaskPage>;
  updateTask(taskId: TaskId, patch: UpdateTaskBody): Promise<Task>;
  updateChecklistItem(
    threadId: ThreadId,
    item: UpdateChecklistItemBody,
  ): Promise<ChecklistResponse>;
  getSettings(): Promise<UserSettings>;
  updateSettings(patch: UserSettingsPatch): Promise<UserSettings>;
}

export interface AiAssistant {
  listAiRunners(): Promise<AiRunnerInfo[]>;
  getAiJob(jobId: AiJobId): Promise<AiJob>;
  runAi(request: AiRunRequest, listener: AiEventListener): Unsubscribe;
}

export interface MailClient
  extends ThreadReader,
    AccountManager,
    Composer,
    Organizer,
    AiAssistant,
    CalendarClient,
    GoogleCalendarClient {
  readonly kind: MailClientKind;
  subscribe(listener: MailEventListener): Unsubscribe;
  onRealtimeConnected(listener: () => void): Unsubscribe;
  dispose(): void;
}

export type { DraftContent };
