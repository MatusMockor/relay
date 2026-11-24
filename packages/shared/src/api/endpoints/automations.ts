import { z } from 'zod';
import {
  AutomationAiInputSchema,
  AutomationConditionSchema,
  AutomationMatchModeSchema,
  AutomationSchema,
  MAX_AUTOMATION_CONDITIONS,
} from '../../domain/automation';
import { AutomationActionsInputSchema } from '../../domain/automation-action';
import { AutomationEntriesSchema } from '../../domain/automation-entry';
import { AutomationIdSchema } from '../../domain/ids';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';
import { AutomationPreviewBodySchema, AutomationPreviewResponseSchema } from './automation-preview';

export const AutomationInputSchema = AutomationSchema.omit({
  id: true,
  userId: true,
  preset: true,
}).extend({
  id: AutomationIdSchema.optional(),
  match: AutomationMatchModeSchema.optional(),
  exceptions: z.array(AutomationConditionSchema).max(MAX_AUTOMATION_CONDITIONS).optional(),
  ai: AutomationAiInputSchema,
  actions: AutomationActionsInputSchema,
});
export type AutomationInput = z.infer<typeof AutomationInputSchema>;

export const KeepAutomationInputSchema = z.object({
  id: AutomationIdSchema,
  keep: z.literal(true),
});
export type KeepAutomationInput = z.infer<typeof KeepAutomationInputSchema>;

export const AutomationReplaceItemSchema = z.union([
  KeepAutomationInputSchema,
  AutomationInputSchema,
]);
export type AutomationReplaceItem = z.infer<typeof AutomationReplaceItemSchema>;

export const isKeepAutomationInput = (item: AutomationReplaceItem): item is KeepAutomationInput =>
  'keep' in item;

export const replaceInputsOf = (items: readonly AutomationReplaceItem[]): AutomationInput[] =>
  items.filter((item): item is AutomationInput => !isKeepAutomationInput(item));

export const MAX_AUTOMATIONS = 50;

export const ReplaceAutomationsBodySchema = z.object({
  automations: z.array(AutomationReplaceItemSchema).max(MAX_AUTOMATIONS),
});
export type ReplaceAutomationsBody = z.infer<typeof ReplaceAutomationsBodySchema>;

export const ApplyAutomationResponseSchema = z.object({
  matched: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type ApplyAutomationResponse = z.infer<typeof ApplyAutomationResponseSchema>;

export const automationsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/automations',
    auth: 'user',
    response: AutomationEntriesSchema,
  }),
  replace: defineEndpoint({
    method: 'PUT',
    path: '/automations',
    auth: 'user',
    body: ReplaceAutomationsBodySchema,
    response: AutomationEntriesSchema,
  }),
  restoreDefault: defineEndpoint({
    method: 'POST',
    path: '/automations/restore-default',
    auth: 'user',
    response: AutomationEntriesSchema,
  }),
  preview: defineEndpoint({
    method: 'POST',
    path: '/automations/preview',
    auth: 'user',
    body: AutomationPreviewBodySchema,
    response: AutomationPreviewResponseSchema,
  }),
  apply: defineEndpoint({
    method: 'POST',
    path: '/automations/:id/apply',
    auth: 'user',
    params: idParamsOf(AutomationIdSchema),
    response: ApplyAutomationResponseSchema,
  }),
};
