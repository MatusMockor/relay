import { z } from 'zod';
import { AutomationSchema } from '../../domain/automation';
import { AutomationIdSchema } from '../../domain/ids';
import { defineEndpoint } from '../endpoint';

export const AutomationInputSchema = AutomationSchema.omit({
  id: true,
  userId: true,
  preset: true,
}).extend({
  id: AutomationIdSchema.optional(),
});
export type AutomationInput = z.infer<typeof AutomationInputSchema>;

export const ReplaceAutomationsBodySchema = z.object({
  automations: z.array(AutomationInputSchema).max(50),
});
export type ReplaceAutomationsBody = z.infer<typeof ReplaceAutomationsBodySchema>;

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
};
