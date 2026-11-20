import { z } from 'zod';
import {
  AutomationHistoryResponseSchema,
  UndoAutomationActivityResponseSchema,
  UndoAutomationSinceBodySchema,
  UndoAutomationSinceResponseSchema,
} from '../api/endpoints/automation-history';
import { AutomationActivityIdSchema, AutomationIdSchema } from '../domain/ids';
import { invokeChannel } from './define';

const automationRef = z.object({ automationId: AutomationIdSchema });

export const automationHistoryInvokeChannels = {
  'local.automations.history': invokeChannel(automationRef, AutomationHistoryResponseSchema),
  'local.automations.undoActivity': invokeChannel(
    automationRef.extend({ activityId: AutomationActivityIdSchema }),
    UndoAutomationActivityResponseSchema,
  ),
  'local.automations.undoSince': invokeChannel(
    automationRef.extend(UndoAutomationSinceBodySchema.shape),
    UndoAutomationSinceResponseSchema,
  ),
};
