import { z } from 'zod';
import { AccountIdSchema, LabelIdSchema } from './ids';
import { HexColorSchema } from './primitives';

export const LabelKindSchema = z.enum(['keyword', 'gmail']);
export type LabelKind = z.infer<typeof LabelKindSchema>;

export const LABEL_NAME_MAX_LENGTH = 500;

export const LabelSchema = z.object({
  id: LabelIdSchema,
  accountId: AccountIdSchema,
  name: z.string().min(1).max(LABEL_NAME_MAX_LENGTH),
  color: HexColorSchema.nullable(),
  kind: LabelKindSchema,
  remoteName: z.string().min(1).max(LABEL_NAME_MAX_LENGTH),
});
export type Label = z.infer<typeof LabelSchema>;

export const labelNameKey = (name: string): string => name.normalize('NFC').toLocaleLowerCase('sk');
