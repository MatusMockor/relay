import { z } from 'zod';
import { AutomationActionSchema } from './automation-action';
import {
  AutomationConditionSchema,
  AutomationMatchModeSchema,
  MAX_AUTOMATION_CONDITIONS,
} from './automation-condition';
import { AccountIdSchema, LabelIdSchema, MailboxIdSchema } from './ids';

export const RULE_SENTENCE_MAX_LENGTH = 500;
export const RULE_SUGGEST_MAX_ACCOUNTS = 20;
export const RULE_SUGGEST_MAX_TARGETS = 300;
export const RULE_SUGGEST_MAX_ACTIONS = 12;
export const RULE_SUGGEST_MAX_NOTES = 20;
export const RULE_SUGGESTION_NOTE_MAX_LENGTH = 200;

const TargetNameSchema = z.string().trim().min(1).max(500);

export const RuleSuggestAccountSchema = z.object({
  id: AccountIdSchema,
  name: z.string().trim().min(1).max(200),
  labels: z
    .array(z.object({ id: LabelIdSchema, name: TargetNameSchema }))
    .max(RULE_SUGGEST_MAX_TARGETS),
  folders: z
    .array(z.object({ id: MailboxIdSchema, name: TargetNameSchema }))
    .max(RULE_SUGGEST_MAX_TARGETS),
});
export type RuleSuggestAccount = z.infer<typeof RuleSuggestAccountSchema>;

export const RuleSentenceSchema = z.string().trim().min(1).max(RULE_SENTENCE_MAX_LENGTH);

export const RuleSuggestRequestSchema = z.object({
  sentence: RuleSentenceSchema,
  accountId: AccountIdSchema.nullable(),
  accounts: z.array(RuleSuggestAccountSchema).max(RULE_SUGGEST_MAX_ACCOUNTS),
});
export type RuleSuggestRequest = z.infer<typeof RuleSuggestRequestSchema>;

export const RuleSuggestionNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(RULE_SUGGESTION_NOTE_MAX_LENGTH);

export const RuleSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  accountId: AccountIdSchema.nullable(),
  match: AutomationMatchModeSchema,
  conditions: z.array(AutomationConditionSchema).max(MAX_AUTOMATION_CONDITIONS),
  exceptions: z.array(AutomationConditionSchema).max(MAX_AUTOMATION_CONDITIONS),
  actions: z.array(AutomationActionSchema).max(RULE_SUGGEST_MAX_ACTIONS),
  understood: z.string().trim().max(600),
  unmapped: z.array(RuleSuggestionNoteSchema).max(RULE_SUGGEST_MAX_NOTES),
});
export type RuleSuggestion = z.infer<typeof RuleSuggestionSchema>;
