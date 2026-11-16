import { z } from 'zod';
import { DraftContentPatchSchema, DraftContentSchema, DraftSchema } from '../../domain/draft';
import { DraftIdSchema, ScheduledSendIdSchema, ThreadIdSchema } from '../../domain/ids';
import { IsoDateTimeSchema } from '../../domain/primitives';
import { ScheduledSendSchema } from '../../domain/scheduled-send';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const CreateDraftBodySchema = DraftContentSchema;
export type CreateDraftBody = z.infer<typeof CreateDraftBodySchema>;

export const UpdateDraftBodySchema = DraftContentPatchSchema;
export type UpdateDraftBody = z.infer<typeof UpdateDraftBodySchema>;

export const SendBodySchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('draft'),
    draftId: DraftIdSchema,
    scheduledAt: IsoDateTimeSchema.optional(),
  }),
  z.object({
    source: z.literal('inline'),
    draft: DraftContentSchema,
    scheduledAt: IsoDateTimeSchema.optional(),
  }),
]);
export type SendBody = z.infer<typeof SendBodySchema>;

export const SendResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('sent'),
    messageIdHeader: z.string().nullable(),
    threadId: ThreadIdSchema.nullable(),
  }),
  z.object({
    status: z.literal('scheduled'),
    scheduledSend: ScheduledSendSchema,
  }),
]);
export type SendResponse = z.infer<typeof SendResponseSchema>;

const draftIdParams = idParamsOf(DraftIdSchema);

export const composeEndpoints = {
  listDrafts: defineEndpoint({
    method: 'GET',
    path: '/drafts',
    auth: 'user',
    response: z.array(DraftSchema),
  }),
  createDraft: defineEndpoint({
    method: 'POST',
    path: '/drafts',
    auth: 'user',
    body: CreateDraftBodySchema,
    response: DraftSchema,
  }),
  updateDraft: defineEndpoint({
    method: 'PATCH',
    path: '/drafts/:id',
    auth: 'user',
    params: draftIdParams,
    body: UpdateDraftBodySchema,
    response: DraftSchema,
  }),
  deleteDraft: defineEndpoint({
    method: 'DELETE',
    path: '/drafts/:id',
    auth: 'user',
    params: draftIdParams,
    response: OkResponseSchema,
  }),
  send: defineEndpoint({
    method: 'POST',
    path: '/send',
    auth: 'user',
    body: SendBodySchema,
    response: SendResponseSchema,
  }),
  listScheduled: defineEndpoint({
    method: 'GET',
    path: '/scheduled',
    auth: 'user',
    response: z.array(ScheduledSendSchema),
  }),
  cancelScheduled: defineEndpoint({
    method: 'DELETE',
    path: '/scheduled/:id',
    auth: 'user',
    params: idParamsOf(ScheduledSendIdSchema),
    response: OkResponseSchema,
  }),
};
