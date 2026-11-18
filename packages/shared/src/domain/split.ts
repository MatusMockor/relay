import { z } from 'zod';
import { AccountIdSchema, SplitIdSchema, UserIdSchema } from './ids';
import { EmailAddressSchema } from './primitives';

export const FromDomainRuleSchema = z.object({
  type: z.literal('fromDomain'),
  domain: z.string().min(1).max(255),
});

export const FromAddressRuleSchema = z.object({
  type: z.literal('fromAddress'),
  address: EmailAddressSchema,
});

export const SubjectRegexRuleSchema = z.object({
  type: z.literal('subjectRegex'),
  pattern: z.string().min(1).max(500),
  caseSensitive: z.boolean(),
});

export const HeaderRuleSchema = z.object({
  type: z.literal('header'),
  name: z.string().min(1).max(200),
  pattern: z.string().min(1).max(500),
});

export const JiraRuleSchema = z.object({
  type: z.literal('jira'),
  projectKeys: z.array(z.string().regex(/^[A-Z][A-Z0-9_]+$/)),
});

export const SplitRuleSchema = z.discriminatedUnion('type', [
  FromDomainRuleSchema,
  FromAddressRuleSchema,
  SubjectRegexRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
]);
export type SplitRule = z.infer<typeof SplitRuleSchema>;
export type SplitRuleType = SplitRule['type'];

export const SplitSchema = z.object({
  id: SplitIdSchema,
  userId: UserIdSchema,
  accountId: AccountIdSchema.nullable(),
  name: z.string().min(1).max(100),
  order: z.number().int().nonnegative(),
  rules: z.array(SplitRuleSchema).min(1),
  exclusive: z.boolean(),
  hideTasks: z.boolean().default(false),
});
export type Split = z.infer<typeof SplitSchema>;
