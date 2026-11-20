import { z } from 'zod';
import { type Automation, AutomationSchema } from './automation';
import { AccountIdSchema, AutomationIdSchema } from './ids';

export const UnsupportedAutomationSchema = z.object({
  kind: z.literal('unsupported'),
  id: AutomationIdSchema,
  name: z.string(),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  accountId: AccountIdSchema.nullable(),
});
export type UnsupportedAutomation = z.infer<typeof UnsupportedAutomationSchema>;

export type AutomationEntry = Automation | UnsupportedAutomation;

const UnsupportedBaseSchema = UnsupportedAutomationSchema.omit({ kind: true });

const NEWER_FIELDS: ReadonlySet<PropertyKey> = new Set(['actions', 'conditions', 'exceptions']);

export const isUnsupportedAutomation = (entry: AutomationEntry): entry is UnsupportedAutomation =>
  'kind' in entry;

export const supportedAutomations = (entries: readonly AutomationEntry[]): Automation[] =>
  entries.filter((entry): entry is Automation => !isUnsupportedAutomation(entry));

export const automationEntryOf = (raw: unknown): AutomationEntry | null => {
  const parsed = AutomationSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  const marked = UnsupportedAutomationSchema.safeParse(raw);
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

export const AutomationEntrySchema = z.unknown().transform((raw, context): AutomationEntry => {
  const entry = automationEntryOf(raw);
  if (entry === null) {
    context.addIssue({ code: 'custom', message: 'Invalid automation' });
    return z.NEVER;
  }
  return entry;
});

export const AutomationEntriesSchema = z.array(AutomationEntrySchema);
