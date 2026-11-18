import { z } from 'zod';
import { FolderViewSchema } from '../../domain/folder-view';
import {
  AccountIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
  SplitIdSchema,
  ThreadIdSchema,
} from '../../domain/ids';
import {
  ChecklistItemIdSchema,
  ChecklistItemSchema,
  ThreadAiStateSchema,
  ThreadDetailSchema,
  ThreadSummarySchema,
} from '../../domain/thread';
import { ThreadActionSchema } from '../../domain/thread-action';
import { TimeZoneSchema } from '../../domain/time-zone';
import { UnsubscribeOptionsSchema, UnsubscribeRequestSchema } from '../../domain/unsubscribe';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';
import { CursorPaginationQuerySchema, pageSchemaOf } from '../pagination';

const folderScopeShape = {
  view: FolderViewSchema,
  accountId: AccountIdSchema.optional(),
  splitId: SplitIdSchema.optional(),
  labelId: LabelIdSchema.optional(),
  mailboxId: MailboxIdSchema.optional(),
};

const FolderScopeSchema = z.object(folderScopeShape);

const requireFolderTarget = (
  scope: z.infer<typeof FolderScopeSchema>,
  context: z.RefinementCtx,
): void => {
  if (scope.view === 'mailbox' && scope.mailboxId === undefined) {
    context.addIssue({ code: 'custom', path: ['mailboxId'], message: 'Chýba priečinok.' });
  }
  if (scope.view === 'label' && scope.labelId === undefined) {
    context.addIssue({ code: 'custom', path: ['labelId'], message: 'Chýba štítok.' });
  }
};

export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  ...folderScopeShape,
  q: z.string().trim().min(1).max(500).optional(),
}).superRefine(requireFolderTarget);
export type ThreadListQuery = z.infer<typeof ThreadListQuerySchema>;

export const MarkFolderReadBodySchema = FolderScopeSchema.extend({
  view: FolderViewSchema.exclude(['drafts', 'scheduled']),
}).superRefine(requireFolderTarget);
export type MarkFolderReadBody = z.infer<typeof MarkFolderReadBodySchema>;

export const MarkFolderReadResponseSchema = z.object({ count: z.number().int().nonnegative() });
export type MarkFolderReadResponse = z.infer<typeof MarkFolderReadResponseSchema>;

export const ThreadPageSchema = pageSchemaOf(ThreadSummarySchema);
export type ThreadPage = z.infer<typeof ThreadPageSchema>;

export const PrepareThreadAiQuerySchema = z.object({
  timeZone: TimeZoneSchema.optional(),
});
export type PrepareThreadAiQuery = z.infer<typeof PrepareThreadAiQuerySchema>;

export const UpdateChecklistItemBodySchema = z.object({
  itemId: ChecklistItemIdSchema,
  done: z.boolean(),
});
export type UpdateChecklistItemBody = z.infer<typeof UpdateChecklistItemBodySchema>;

export const ChecklistResponseSchema = z.object({ checklist: z.array(ChecklistItemSchema) });
export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>;

const threadIdParams = idParamsOf(ThreadIdSchema);

export const threadsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/threads',
    auth: 'user',
    query: ThreadListQuerySchema,
    response: ThreadPageSchema,
  }),
  markFolderRead: defineEndpoint({
    method: 'POST',
    path: '/threads/mark-read',
    auth: 'user',
    body: MarkFolderReadBodySchema,
    response: MarkFolderReadResponseSchema,
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/threads/:id',
    auth: 'user',
    params: threadIdParams,
    response: ThreadDetailSchema,
  }),
  action: defineEndpoint({
    method: 'POST',
    path: '/threads/:id/actions',
    auth: 'user',
    params: threadIdParams,
    body: ThreadActionSchema,
    response: ThreadSummarySchema,
  }),
  prepareAi: defineEndpoint({
    method: 'POST',
    path: '/threads/:id/ai/prepare',
    auth: 'user',
    params: threadIdParams,
    query: PrepareThreadAiQuerySchema,
    response: ThreadAiStateSchema,
  }),
  requestSummary: defineEndpoint({
    method: 'POST',
    path: '/threads/:id/ai/summary',
    auth: 'user',
    params: threadIdParams,
    query: PrepareThreadAiQuerySchema,
    response: ThreadAiStateSchema,
  }),
  updateChecklist: defineEndpoint({
    method: 'PATCH',
    path: '/threads/:id/checklist',
    auth: 'user',
    params: threadIdParams,
    body: UpdateChecklistItemBodySchema,
    response: ChecklistResponseSchema,
  }),
  unsubscribeOptions: defineEndpoint({
    method: 'GET',
    path: '/threads/:id/unsubscribe',
    auth: 'user',
    params: threadIdParams,
    response: UnsubscribeOptionsSchema,
  }),
  unsubscribe: defineEndpoint({
    method: 'POST',
    path: '/threads/:id/unsubscribe',
    auth: 'user',
    params: threadIdParams,
    body: UnsubscribeRequestSchema,
    response: OkResponseSchema,
  }),
};
