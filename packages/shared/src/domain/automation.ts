import { z } from 'zod';
import { AiRunnerKindSchema } from './ai';
import { AutomationActionsSchema } from './automation-action';
import { AiEffortSchema, AiModelIdSchema, refineAiModelChoice } from './ai-model-catalog';
import { AccountIdSchema, AutomationIdSchema, UserIdSchema } from './ids';
import { JiraEventKindSchema } from './jira-event';
import {
  FromAddressRuleSchema,
  FromDomainRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  SubjectRegexRuleSchema,
} from './split';

export const JiraEventConditionSchema = z.object({
  type: z.literal('jiraEvent'),
  kind: JiraEventKindSchema,
});

export const RecipientFieldSchema = z.enum(['to', 'cc', 'any']);
export type RecipientField = z.infer<typeof RecipientFieldSchema>;

export const RecipientConditionSchema = z.object({
  type: z.literal('recipient'),
  field: RecipientFieldSchema,
  match: z.enum(['address', 'domain']),
  value: z.string().trim().min(1).max(255),
});

export const HasAttachmentConditionSchema = z.object({
  type: z.literal('hasAttachment'),
});

export const SubjectContainsConditionSchema = z.object({
  type: z.literal('subjectContains'),
  value: z.string().trim().min(1).max(200),
});

export const AutomationConditionSchema = z.discriminatedUnion('type', [
  FromDomainRuleSchema,
  FromAddressRuleSchema,
  SubjectRegexRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  JiraEventConditionSchema,
  RecipientConditionSchema,
  HasAttachmentConditionSchema,
  SubjectContainsConditionSchema,
]);
export type AutomationCondition = z.infer<typeof AutomationConditionSchema>;
export type AutomationConditionType = AutomationCondition['type'];

export const AutomationMatchModeSchema = z.enum(['all', 'any']);
export type AutomationMatchMode = z.infer<typeof AutomationMatchModeSchema>;

export const MAX_AUTOMATION_CONDITIONS = 20;

export const AutomationPresetSchema = z.enum(['jiraTasks']);
export type AutomationPreset = z.infer<typeof AutomationPresetSchema>;

export const AutomationAiSchema = z.object({
  runner: AiRunnerKindSchema,
  model: AiModelIdSchema.nullable(),
  effort: AiEffortSchema.nullable(),
  instructions: z.string().trim().min(1).max(2_000).nullable(),
});
export type AutomationAi = z.infer<typeof AutomationAiSchema>;

export const AutomationAiInputSchema = AutomationAiSchema.superRefine(refineAiModelChoice);

export const AutomationSchema = z.object({
  id: AutomationIdSchema,
  userId: UserIdSchema,
  accountId: AccountIdSchema.nullable(),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  preset: AutomationPresetSchema.nullable(),
  match: AutomationMatchModeSchema.default('all'),
  conditions: z.array(AutomationConditionSchema).min(1).max(MAX_AUTOMATION_CONDITIONS),
  exceptions: z.array(AutomationConditionSchema).max(MAX_AUTOMATION_CONDITIONS).default([]),
  ai: AutomationAiSchema,
  actions: AutomationActionsSchema,
});
export type Automation = z.infer<typeof AutomationSchema>;
