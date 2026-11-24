import { z } from 'zod';
import { AccountIdSchema, SplitIdSchema, UserIdSchema } from './ids';
import {
  AutomationMatchModeSchema,
  FromAddressRuleSchema,
  FromDomainRuleSchema,
  HasAttachmentConditionSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  MAX_AUTOMATION_CONDITIONS,
  RecipientConditionSchema,
  SubjectContainsConditionSchema,
  SubjectRegexRuleSchema,
} from './mail-conditions';

export {
  FromAddressRuleSchema,
  FromDomainRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  SubjectRegexRuleSchema,
} from './mail-conditions';

export const SplitRuleSchema = z.discriminatedUnion('type', [
  FromDomainRuleSchema,
  FromAddressRuleSchema,
  SubjectRegexRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  RecipientConditionSchema,
  HasAttachmentConditionSchema,
  SubjectContainsConditionSchema,
]);
export type SplitRule = z.infer<typeof SplitRuleSchema>;
export type SplitRuleType = SplitRule['type'];

export const SPLIT_RULE_TYPES: readonly SplitRuleType[] = SplitRuleSchema.options.map(
  (option) => option.shape.type.value,
);

export const MAX_SPLIT_EXCEPTIONS = MAX_AUTOMATION_CONDITIONS;

export const SplitExceptionsSchema = z.array(SplitRuleSchema).max(MAX_SPLIT_EXCEPTIONS);

export const SplitSchema = z.object({
  id: SplitIdSchema,
  userId: UserIdSchema,
  accountId: AccountIdSchema.nullable(),
  name: z.string().min(1).max(100),
  order: z.number().int().nonnegative(),
  match: AutomationMatchModeSchema.default('any'),
  rules: z.array(SplitRuleSchema).min(1),
  exceptions: SplitExceptionsSchema.default([]),
  exclusive: z.boolean(),
  hideTasks: z.boolean().default(false),
});
export type Split = z.infer<typeof SplitSchema>;

export const isSplitRuleType = (type: string): type is SplitRuleType =>
  SPLIT_RULE_TYPES.some((known) => known === type);
