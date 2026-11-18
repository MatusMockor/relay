import { z } from 'zod';
import { AutomationAiInputSchema, AutomationSchema } from '../../domain/automation';
import { AutomationActionsInputSchema } from '../../domain/automation-action';
import { AutomationIdSchema } from '../../domain/ids';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';

export const AutomationInputSchema = AutomationSchema.omit({
  id: true,
  userId: true,
  preset: true,
}).extend({
  id: AutomationIdSchema.optional(),
  ai: AutomationAiInputSchema,
  actions: AutomationActionsInputSchema,
});
export type AutomationInput = z.infer<typeof AutomationInputSchema>;

export const ReplaceAutomationsBodySchema = z.object({
  automations: z.array(AutomationInputSchema).max(50),
});
export type ReplaceAutomationsBody = z.infer<typeof ReplaceAutomationsBodySchema>;

export const ApplyAutomationResponseSchema = z.object({
  matched: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
});
export type ApplyAutomationResponse = z.infer<typeof ApplyAutomationResponseSchema>;

export const automationsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/automations',
    auth: 'user',
    response: z.array(AutomationSchema),
  }),
  replace: defineEndpoint({
    method: 'PUT',
    path: '/automations',
    auth: 'user',
    body: ReplaceAutomationsBodySchema,
    response: z.array(AutomationSchema),
  }),
  apply: defineEndpoint({
    method: 'POST',
    path: '/automations/:id/apply',
    auth: 'user',
    params: idParamsOf(AutomationIdSchema),
    response: ApplyAutomationResponseSchema,
  }),
};
