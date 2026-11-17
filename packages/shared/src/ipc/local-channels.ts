import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import {
  CreateAccountBodySchema,
  TestConnectionBodySchema,
  TestConnectionResponseSchema,
  UpdateAccountBodySchema,
} from '../api/endpoints/accounts';
import {
  CreateDraftBodySchema,
  SendBodySchema,
  SendResponseSchema,
  UpdateDraftBodySchema,
} from '../api/endpoints/compose';
import { LabelListQuerySchema } from '../api/endpoints/labels';
import { ReplaceSplitsBodySchema } from '../api/endpoints/splits';
import { TaskListQuerySchema, TaskPageSchema, UpdateTaskBodySchema } from '../api/endpoints/tasks';
import {
  ChecklistResponseSchema,
  PrepareThreadAiQuerySchema,
  ThreadListQuerySchema,
  ThreadPageSchema,
  UpdateChecklistItemBodySchema,
} from '../api/endpoints/threads';
import { MailAccountSchema } from '../domain/account';
import { AiJobSchema } from '../domain/ai';
import { DraftSchema } from '../domain/draft';
import {
  AccountIdSchema,
  AiJobIdSchema,
  AttachmentIdSchema,
  DraftIdSchema,
  ScheduledSendIdSchema,
  TaskIdSchema,
  ThreadIdSchema,
} from '../domain/ids';
import { LabelSchema } from '../domain/label';
import { MailboxSchema } from '../domain/mailbox';
import { ScheduledSendSchema } from '../domain/scheduled-send';
import { UserSettingsPatchSchema, UserSettingsSchema } from '../domain/settings';
import { SplitSchema } from '../domain/split';
import { TaskSchema } from '../domain/task';
import { ThreadAiStateSchema, ThreadDetailSchema, ThreadSummarySchema } from '../domain/thread';
import { ThreadActionSchema } from '../domain/thread-action';
import { RealtimeEventSchema } from '../realtime/events';
import { invokeChannel, streamChannel } from './define';

const accountRef = z.object({ accountId: AccountIdSchema });

export const LocalAttachmentContentSchema = z.object({
  filename: z.string().nullable(),
  contentType: z.string().min(1),
  contentBase64: z.base64(),
});
export type LocalAttachmentContent = z.infer<typeof LocalAttachmentContentSchema>;

const threadAiRequest = PrepareThreadAiQuerySchema.extend({ threadId: ThreadIdSchema });

export const localInvokeChannels = {
  'local.threads.list': invokeChannel(ThreadListQuerySchema, ThreadPageSchema),
  'local.threads.get': invokeChannel(z.object({ threadId: ThreadIdSchema }), ThreadDetailSchema),
  'local.threads.prepareAi': invokeChannel(threadAiRequest, ThreadAiStateSchema),
  'local.threads.requestSummary': invokeChannel(threadAiRequest, ThreadAiStateSchema),
  'local.threads.action': invokeChannel(
    z.object({ threadId: ThreadIdSchema, action: ThreadActionSchema }),
    ThreadSummarySchema,
  ),
  'local.threads.updateChecklist': invokeChannel(
    z.object({ threadId: ThreadIdSchema, item: UpdateChecklistItemBodySchema }),
    ChecklistResponseSchema,
  ),
  'local.ai.getJob': invokeChannel(z.object({ jobId: AiJobIdSchema }), AiJobSchema),
  'local.labels.list': invokeChannel(LabelListQuerySchema, z.array(LabelSchema)),
  'local.accounts.list': invokeChannel(z.undefined(), z.array(MailAccountSchema)),
  'local.accounts.create': invokeChannel(CreateAccountBodySchema, MailAccountSchema),
  'local.accounts.update': invokeChannel(
    accountRef.extend({ patch: UpdateAccountBodySchema }),
    MailAccountSchema,
  ),
  'local.accounts.delete': invokeChannel(accountRef, OkResponseSchema),
  'local.accounts.testConnection': invokeChannel(
    TestConnectionBodySchema,
    TestConnectionResponseSchema,
  ),
  'local.accounts.mailboxes': invokeChannel(accountRef, z.array(MailboxSchema)),
  'local.sync.now': invokeChannel(
    z.object({ accountId: AccountIdSchema.optional() }),
    OkResponseSchema,
  ),
  'local.settings.get': invokeChannel(z.undefined(), UserSettingsSchema),
  'local.settings.update': invokeChannel(UserSettingsPatchSchema, UserSettingsSchema),
  'local.tasks.list': invokeChannel(TaskListQuerySchema, TaskPageSchema),
  'local.tasks.update': invokeChannel(
    z.object({ taskId: TaskIdSchema, patch: UpdateTaskBodySchema }),
    TaskSchema,
  ),
  'local.splits.list': invokeChannel(z.undefined(), z.array(SplitSchema)),
  'local.splits.replace': invokeChannel(ReplaceSplitsBodySchema, z.array(SplitSchema)),
  'local.drafts.list': invokeChannel(z.undefined(), z.array(DraftSchema)),
  'local.drafts.create': invokeChannel(CreateDraftBodySchema, DraftSchema),
  'local.drafts.update': invokeChannel(
    z.object({ draftId: DraftIdSchema, patch: UpdateDraftBodySchema }),
    DraftSchema,
  ),
  'local.drafts.delete': invokeChannel(z.object({ draftId: DraftIdSchema }), OkResponseSchema),
  'local.attachments.content': invokeChannel(
    z.object({ attachmentId: AttachmentIdSchema }),
    LocalAttachmentContentSchema,
  ),
  'local.send': invokeChannel(SendBodySchema, SendResponseSchema),
  'local.scheduled.list': invokeChannel(z.undefined(), z.array(ScheduledSendSchema)),
  'local.scheduled.cancel': invokeChannel(
    z.object({ scheduledSendId: ScheduledSendIdSchema }),
    OkResponseSchema,
  ),
};

export const localStreamChannels = {
  'local.events': streamChannel(z.undefined(), RealtimeEventSchema),
};
