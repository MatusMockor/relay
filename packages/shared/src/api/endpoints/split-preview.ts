import { z } from 'zod';
import { AccountIdSchema, SplitIdSchema } from '../../domain/ids';
import { AutomationMatchModeSchema } from '../../domain/mail-conditions';
import { SplitExceptionsSchema, SplitRuleSchema } from '../../domain/split';
import { AutomationPreviewResponseSchema } from './automation-preview';

export const SplitPreviewBodySchema = z.object({
  splitId: SplitIdSchema.nullable(),
  accountId: AccountIdSchema.nullable(),
  match: AutomationMatchModeSchema,
  rules: z.array(SplitRuleSchema).min(1),
  exceptions: SplitExceptionsSchema,
});
export type SplitPreviewBody = z.infer<typeof SplitPreviewBodySchema>;

export const SplitOverlapKindSchema = z.enum(['split', 'automation']);
export type SplitOverlapKind = z.infer<typeof SplitOverlapKindSchema>;

export const SplitOverlapSchema = z.object({
  kind: SplitOverlapKindSchema,
  id: z.string().min(1),
  name: z.string(),
  count: z.number().int().positive(),
});
export type SplitOverlap = z.infer<typeof SplitOverlapSchema>;

export const SplitPreviewResponseSchema = AutomationPreviewResponseSchema.extend({
  overlaps: z.array(SplitOverlapSchema),
});
export type SplitPreviewResponse = z.infer<typeof SplitPreviewResponseSchema>;
