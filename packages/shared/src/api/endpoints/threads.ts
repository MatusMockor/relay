import { z } from 'zod';
import { FolderViewSchema } from '../../domain/folder-view';
import { AccountIdSchema, LabelIdSchema, SplitIdSchema, ThreadIdSchema } from '../../domain/ids';
import { ThreadDetailSchema, ThreadSummarySchema } from '../../domain/thread';
import { ThreadActionSchema } from '../../domain/thread-action';
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
};
