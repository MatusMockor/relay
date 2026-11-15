import { z } from 'zod';
import { AccountIdSchema, LabelIdSchema } from './ids';
import { HexColorSchema } from './primitives';

export const LabelSchema = z.object({
  id: LabelIdSchema,
  accountId: AccountIdSchema,
  name: z.string().min(1).max(200),
  color: HexColorSchema.nullable(),
});
export type Label = z.infer<typeof LabelSchema>;
