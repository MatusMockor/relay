import { z } from 'zod';
import { MailboxIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';

const CountSchema = z.number().int().nonnegative();

export const CopyMergeResolveCursorSchema = z.object({
  mailboxId: MailboxIdSchema,
  afterUid: CountSchema,
});
export type CopyMergeResolveCursor = z.infer<typeof CopyMergeResolveCursorSchema>;

export const CopyMergePassSchema = z.object({
  merged: CountSchema,
  conflicts: CountSchema,
  spanning: CountSchema,
});
export type CopyMergePass = z.infer<typeof CopyMergePassSchema>;

export const CopyMergeWorkSchema = z.object({
  resolve: z.array(CopyMergeResolveCursorSchema).nullable(),
  afterEmailId: z.string().min(1).nullable(),
  pass: CopyMergePassSchema,
  retryAfter: IsoDateTimeSchema.nullable(),
});
export type CopyMergeWork = z.infer<typeof CopyMergeWorkSchema>;

export const FRESH_COPY_MERGE_WORK: CopyMergeWork = {
  resolve: null,
  afterEmailId: null,
  pass: { merged: 0, conflicts: 0, spanning: 0 },
  retryAfter: null,
};

export const parseCopyMergeWork = (payload: unknown): CopyMergeWork => {
  const parsed = CopyMergeWorkSchema.safeParse(payload);
  return parsed.success ? parsed.data : FRESH_COPY_MERGE_WORK;
};
