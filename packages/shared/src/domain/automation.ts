import { z } from 'zod';
import { AiRunnerKindSchema } from './ai';
import { AutomationActionsSchema } from './automation-action';
import { AiEffortSchema, AiModelIdSchema, refineAiModelChoice } from './ai-model-catalog';
import { AccountIdSchema, AutomationIdSchema, UserIdSchema } from './ids';
import {
  AutomationConditionSchema,
  AutomationMatchModeSchema,
  MAX_AUTOMATION_CONDITIONS,
} from './automation-condition';

export {
  AutomationConditionSchema,
  type AutomationCondition,
  type AutomationConditionType,
  AutomationMatchModeSchema,
  type AutomationMatchMode,
  HasAttachmentConditionSchema,
  JiraEventConditionSchema,
  MAX_AUTOMATION_CONDITIONS,
  RecipientConditionSchema,
  type RecipientField,
  RecipientFieldSchema,
  SubjectContainsConditionSchema,
} from './automation-condition';

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
