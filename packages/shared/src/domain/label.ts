import { z } from 'zod';
import { AccountIdSchema, LabelIdSchema } from './ids';
import { HexColorSchema } from './primitives';

export const LabelKindSchema = z.enum(['keyword', 'gmail']);
export type LabelKind = z.infer<typeof LabelKindSchema>;

export const LabelSchema = z.object({
  id: LabelIdSchema,
  accountId: AccountIdSchema,
  name: z.string().min(1).max(200),
  color: HexColorSchema.nullable(),
  kind: LabelKindSchema,
  remoteName: z.string().min(1).max(500),
});
export type Label = z.infer<typeof LabelSchema>;
