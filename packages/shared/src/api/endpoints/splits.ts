import { z } from 'zod';
import { SplitIdSchema } from '../../domain/ids';
import { SplitSchema } from '../../domain/split';
import { defineEndpoint } from '../endpoint';

export const SplitInputSchema = SplitSchema.omit({ id: true, userId: true }).extend({
  id: SplitIdSchema.optional(),
});
export type SplitInput = z.infer<typeof SplitInputSchema>;

export const ReplaceSplitsBodySchema = z.object({
  splits: z.array(SplitInputSchema).max(50),
});
export type ReplaceSplitsBody = z.infer<typeof ReplaceSplitsBodySchema>;

export const splitsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/splits',
    auth: 'user',
    response: z.array(SplitSchema),
  }),
  replace: defineEndpoint({
    method: 'PUT',
    path: '/splits',
    auth: 'user',
    body: ReplaceSplitsBodySchema,
    response: z.array(SplitSchema),
  }),
};
