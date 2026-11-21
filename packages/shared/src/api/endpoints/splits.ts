import { z } from 'zod';
import { SplitIdSchema } from '../../domain/ids';
import { AutomationMatchModeSchema } from '../../domain/mail-conditions';
import { SplitExceptionsSchema, SplitSchema } from '../../domain/split';
import { SplitEntriesSchema } from '../../domain/split-entry';
import { defineEndpoint } from '../endpoint';
import { SplitPreviewBodySchema, SplitPreviewResponseSchema } from './split-preview';

export const SplitInputSchema = SplitSchema.omit({ id: true, userId: true }).extend({
  id: SplitIdSchema.optional(),
  match: AutomationMatchModeSchema.optional(),
  exceptions: SplitExceptionsSchema.optional(),
});
export type SplitInput = z.infer<typeof SplitInputSchema>;

export const KeepSplitInputSchema = z.object({
  id: SplitIdSchema,
  keep: z.literal(true),
});
export type KeepSplitInput = z.infer<typeof KeepSplitInputSchema>;

export const SplitReplaceItemSchema = z.union([KeepSplitInputSchema, SplitInputSchema]);
export type SplitReplaceItem = z.infer<typeof SplitReplaceItemSchema>;

export const isKeepSplitInput = (item: SplitReplaceItem): item is KeepSplitInput => 'keep' in item;

export const splitInputsOf = (items: readonly SplitReplaceItem[]): SplitInput[] =>
  items.filter((item): item is SplitInput => !isKeepSplitInput(item));

export const MAX_SPLITS = 50;

export const ReplaceSplitsBodySchema = z.object({
  splits: z.array(SplitReplaceItemSchema).max(MAX_SPLITS),
});
export type ReplaceSplitsBody = z.infer<typeof ReplaceSplitsBodySchema>;

export const splitsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/splits',
    auth: 'user',
    response: SplitEntriesSchema,
  }),
  replace: defineEndpoint({
    method: 'PUT',
    path: '/splits',
    auth: 'user',
    body: ReplaceSplitsBodySchema,
    response: SplitEntriesSchema,
  }),
  preview: defineEndpoint({
    method: 'POST',
    path: '/splits/preview',
    auth: 'user',
    body: SplitPreviewBodySchema,
    response: SplitPreviewResponseSchema,
  }),
};
