import {
  AccountIdSchema,
  DraftContentSchema,
  DraftSchema,
  FolderViewSchema,
  LabelIdSchema,
  SplitIdSchema,
  TaskSchema,
  TaskStateSchema,
  ThreadDetailSchema,
  ThreadIdSchema,
  ThreadSummarySchema,
} from '@relay/shared/domain';
import { z } from 'zod';

export const HelloSchema = z.object({ type: z.literal('hello'), token: z.string().min(1) });
export const HelloReplySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('rejected'), message: z.string() }),
]);

export const SocketRequestSchema = z.object({
  id: z.number().int().nonnegative(),
  method: z.enum(['listFolder', 'getThread', 'listTasks', 'createTask', 'createDraft']),
  params: z.unknown(),
});
export type SocketRequest = z.infer<typeof SocketRequestSchema>;
export type SocketMethodName = SocketRequest['method'];

export const SocketResponseSchema = z.discriminatedUnion('ok', [
  z.object({ id: z.number().int(), ok: z.literal(true), result: z.unknown() }),
  z.object({ id: z.number().int(), ok: z.literal(false), error: z.string() }),
]);
export type SocketResponse = z.infer<typeof SocketResponseSchema>;

const pageOf = <Item extends z.ZodType>(item: Item) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

const PageRequestShape = {
  cursor: z.string().nullable(),
  limit: z.number().int().min(1).max(200),
};

export const SOCKET_SCHEMAS = {
  listFolder: {
    params: z.object({
      view: FolderViewSchema,
      accountId: AccountIdSchema.nullable(),
      splitId: SplitIdSchema.nullable(),
      labelId: LabelIdSchema.nullable(),
      search: z.string().nullable(),
      ...PageRequestShape,
    }),
    result: pageOf(ThreadSummarySchema),
  },
  getThread: {
    params: z.object({ threadId: ThreadIdSchema }),
    result: ThreadDetailSchema.nullable(),
  },
  listTasks: {
    params: z.object({ state: TaskStateSchema.nullable(), ...PageRequestShape }),
    result: pageOf(TaskSchema),
  },
  createTask: {
    params: z.object({
      threadId: ThreadIdSchema.nullable(),
      title: z.string().min(1).max(500),
      aiWhat: z.string().nullable(),
    }),
    result: TaskSchema,
  },
  createDraft: { params: DraftContentSchema, result: DraftSchema },
} as const satisfies Record<SocketMethodName, { params: z.ZodType; result: z.ZodType }>;
