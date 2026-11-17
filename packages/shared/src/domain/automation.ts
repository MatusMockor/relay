import { z } from 'zod';
import { AiRunnerKindSchema } from './ai';
import { AiEffortSchema, AiModelIdSchema, refineAiModelChoice } from './ai-model-catalog';
import { AccountIdSchema, AutomationIdSchema, UserIdSchema } from './ids';
import {
  FromAddressRuleSchema,
  FromDomainRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  SubjectRegexRuleSchema,
} from './split';

export const JiraEventKindSchema = z.enum(['mention', 'assigned', 'comment', 'status', 'other']);
export type JiraEventKind = z.infer<typeof JiraEventKindSchema>;

export const JiraEventConditionSchema = z.object({
  type: z.literal('jiraEvent'),
  kind: JiraEventKindSchema,
});

export const AutomationConditionSchema = z.discriminatedUnion('type', [
  FromDomainRuleSchema,
  FromAddressRuleSchema,
  SubjectRegexRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  JiraEventConditionSchema,
]);
export type AutomationCondition = z.infer<typeof AutomationConditionSchema>;
export type AutomationConditionType = AutomationCondition['type'];

export const AutomationActionSchema = z.enum([
  'summary',
  'task',
  'notify',
  'markRead',
  'pin',
  'archive',
]);
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

export const AutomationPresetSchema = z.enum(['jiraTasks']);
export type AutomationPreset = z.infer<typeof AutomationPresetSchema>;

export const AutomationAiSchema = z
  .object({
    runner: AiRunnerKindSchema,
    model: AiModelIdSchema.nullable(),
    effort: AiEffortSchema.nullable(),
    instructions: z.string().trim().min(1).max(2_000).nullable(),
  })
  .superRefine(refineAiModelChoice);
export type AutomationAi = z.infer<typeof AutomationAiSchema>;

export const AutomationActionsSchema = z
  .array(AutomationActionSchema)
  .min(1)
  .refine((actions) => new Set(actions).size === actions.length, {
    message: 'Actions must be unique',
  });

export const AutomationSchema = z.object({
  id: AutomationIdSchema,
  userId: UserIdSchema,
  accountId: AccountIdSchema.nullable(),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  order: z.number().int().nonnegative(),
  preset: AutomationPresetSchema.nullable(),
  conditions: z.array(AutomationConditionSchema).min(1).max(20),
  ai: AutomationAiSchema,
  actions: AutomationActionsSchema,
});
export type Automation = z.infer<typeof AutomationSchema>;
