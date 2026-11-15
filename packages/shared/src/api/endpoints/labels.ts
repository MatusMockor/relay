import { z } from 'zod';
import { AccountIdSchema } from '../../domain/ids';
import { LabelSchema } from '../../domain/label';
import { defineEndpoint } from '../endpoint';

export const LabelListQuerySchema = z.object({ accountId: AccountIdSchema.optional() });
export type LabelListQuery = z.infer<typeof LabelListQuerySchema>;

export const labelsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/labels',
    auth: 'user',
    query: LabelListQuerySchema,
    response: z.array(LabelSchema),
  }),
};
