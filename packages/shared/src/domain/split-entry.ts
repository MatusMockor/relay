import { z } from 'zod';
import { AccountIdSchema, SplitIdSchema } from './ids';
import { type Split, SplitSchema } from './split';

export const UnsupportedSplitSchema = z.object({
  kind: z.literal('unsupported'),
  id: SplitIdSchema,
  accountId: AccountIdSchema.nullable(),
  name: z.string(),
  order: z.number().int().nonnegative(),
  exclusive: z.boolean(),
  hideTasks: z.boolean().default(false),
});
export type UnsupportedSplit = z.infer<typeof UnsupportedSplitSchema>;

export type SplitEntry = Split | UnsupportedSplit;

const UnsupportedBaseSchema = UnsupportedSplitSchema.omit({ kind: true });

const NEWER_FIELDS: ReadonlySet<PropertyKey> = new Set(['match', 'rules', 'exceptions']);

export const isUnsupportedSplit = (entry: SplitEntry): entry is UnsupportedSplit => 'kind' in entry;

export const supportedSplits = (entries: readonly SplitEntry[]): Split[] =>
  entries.filter((entry): entry is Split => !isUnsupportedSplit(entry));

export const splitEntryOf = (raw: unknown): SplitEntry | null => {
  const parsed = SplitSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  const marked = UnsupportedSplitSchema.safeParse(raw);
  if (marked.success) {
    return marked.data;
  }
  const newer = parsed.error.issues.every((issue) => NEWER_FIELDS.has(issue.path[0] ?? ''));
  const base = UnsupportedBaseSchema.safeParse(raw);
  if (!newer || !base.success) {
    return null;
  }
  return { kind: 'unsupported', ...base.data };
};

export const SplitEntrySchema = z.unknown().transform((raw, context): SplitEntry => {
  const entry = splitEntryOf(raw);
  if (entry === null) {
    context.addIssue({ code: 'custom', message: 'Invalid split' });
    return z.NEVER;
  }
  return entry;
});

export const SplitEntriesSchema = z.array(SplitEntrySchema);
