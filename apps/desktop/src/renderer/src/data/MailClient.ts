import type {
  AccountId,
  AiEvent,
  AiJob,
  AiJobId,
  AttachmentId,
  ChecklistResponse,
  AiRunnerInfo,
  AiRunRequest,
  CreateAccountBody,
  DraftAttachment,
  DraftContent,
  DraftId,
  Label,
  MailAccount,
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
  UpdateTaskBody,
  UserSettings,
  UserSettingsPatch,
} from '@relay/shared';

export type MailClientKind = 'remote' | 'local' | 'demo';

export type ThreadListParams = Omit<ThreadListQuery, 'limit'> & { readonly limit?: number };
export type TaskListParams = Omit<TaskListQuery, 'limit'> & { readonly limit?: number };
export type CreateDraftInput = Omit<DraftContent, 'attachments'> & {
  readonly attachments?: DraftAttachment[];
};

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
  prepareThreadAi(threadId: ThreadId): Promise<ThreadAiState>;
  applyThreadAction(threadId: ThreadId, action: ThreadAction): Promise<ThreadSummary>;
  listLabels(accountId?: AccountId): Promise<Label[]>;
  downloadAttachment(attachmentId: AttachmentId): Promise<AttachmentFile>;
}

export interface AccountManager {
  listAccounts(): Promise<MailAccount[]>;
  createAccount(body: CreateAccountBody): Promise<MailAccount>;
  updateAccount(accountId: AccountId, patch: UpdateAccountBody): Promise<MailAccount>;
  removeAccount(accountId: AccountId): Promise<void>;
  testConnection(body: TestConnectionBody): Promise<TestConnectionResponse>;
  syncNow(accountId?: AccountId): Promise<void>;
}

export interface Composer {
  listDrafts(): Promise<Draft[]>;
  createDraft(content: CreateDraftInput): Promise<Draft>;
  updateDraft(draftId: DraftId, patch: UpdateDraftBody): Promise<Draft>;
  deleteDraft(draftId: DraftId): Promise<void>;
  send(body: SendBody): Promise<SendResponse>;
  listScheduled(): Promise<ScheduledSend[]>;
  cancelScheduled(scheduledSendId: ScheduledSendId): Promise<void>;
}

export interface Organizer {
  listSplits(): Promise<Split[]>;
  replaceSplits(splits: SplitInput[]): Promise<Split[]>;
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

export interface MailClient extends ThreadReader, AccountManager, Composer, Organizer, AiAssistant {
  readonly kind: MailClientKind;
  subscribe(listener: MailEventListener): Unsubscribe;
  onRealtimeConnected(listener: () => void): Unsubscribe;
  dispose(): void;
}

export type { DraftContent };
