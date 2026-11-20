import { z } from 'zod';
import { AccountIdSchema, MessageIdSchema } from '../../domain/ids';
import { IsoDateTimeSchema } from '../../domain/primitives';
import { ThreadSummarySchema } from '../../domain/thread';
import { ThreadSearchFieldSchema } from '../../domain/thread-search-field';

export const ServerSearchStatusSchema = z.enum([
  'ok',
  'partial',
  'offline',
  'skipped',
  'unsupported',
]);
export type ServerSearchStatus = z.infer<typeof ServerSearchStatusSchema>;

export const ServerSearchRequestSchema = z.object({
  requestId: z.string().min(1).max(64),
  q: z.string().trim().min(1).max(500),
  accountId: AccountIdSchema.optional(),
  searchField: ThreadSearchFieldSchema.optional(),
  hasAttachment: z.boolean().optional(),
  unread: z.boolean().optional(),
});
export type ServerSearchRequest = z.infer<typeof ServerSearchRequestSchema>;

export const ServerSearchHitSchema = z.object({
  thread: ThreadSummarySchema,
  messageId: MessageIdSchema,
  date: IsoDateTimeSchema,
});
export type ServerSearchHit = z.infer<typeof ServerSearchHitSchema>;

export const ServerSearchResponseSchema = z.object({
  requestId: z.string().min(1).max(64),
  status: ServerSearchStatusSchema,
  hits: z.array(ServerSearchHitSchema),
});
export type ServerSearchResponse = z.infer<typeof ServerSearchResponseSchema>;
