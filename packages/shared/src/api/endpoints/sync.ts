import { z } from 'zod';
import { AccountIdSchema } from '../../domain/ids';
import { defineEndpoint } from '../endpoint';

export const SyncNowBodySchema = z
  .object({
    accountId: AccountIdSchema.optional(),
  })
  .default({});
export type SyncNowBody = z.infer<typeof SyncNowBodySchema>;

export const SyncNowResponseSchema = z.object({ accepted: z.literal(true) });
export type SyncNowResponse = z.infer<typeof SyncNowResponseSchema>;

export const syncEndpoints = {
  now: defineEndpoint({
    method: 'POST',
    path: '/sync',
    auth: 'user',
    body: SyncNowBodySchema,
    response: SyncNowResponseSchema,
  }),
};
