import { z } from 'zod';
import { FolderViewSchema } from '../../domain/folder-view';
import { AccountIdSchema, LabelIdSchema, SplitIdSchema, ThreadIdSchema } from '../../domain/ids';
import {
  ChecklistItemIdSchema,
  ChecklistItemSchema,
  ThreadAiStateSchema,
  ThreadDetailSchema,
  ThreadSummarySchema,
} from '../../domain/thread';
import { ThreadActionSchema } from '../../domain/thread-action';
import { TimeZoneSchema } from '../../domain/time-zone';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';
import { CursorPaginationQuerySchema, pageSchemaOf } from '../pagination';

export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  view: FolderViewSchema,
  accountId: AccountIdSchema.optional(),
  splitId: SplitIdSchema.optional(),
  labelId: LabelIdSchema.optional(),
  q: z.string().trim().min(1).max(500).optional(),
});
export type ThreadListQuery = z.infer<typeof ThreadListQuerySchema>;

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
};
