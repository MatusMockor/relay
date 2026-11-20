import { z } from 'zod';
import { AddressSchema } from './address';
import {
  type AutomationAction,
  AutomationActionSchema,
  MAIL_AUTOMATION_ACTION_TYPES,
} from './automation-action';
import {
  AccountIdSchema,
  AutomationActivityIdSchema,
  AutomationIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
} from './ids';
import { IsoDateTimeSchema } from './primitives';

export const AutomationActivitySourceSchema = z.enum(['live', 'apply']);
export type AutomationActivitySource = z.infer<typeof AutomationActivitySourceSchema>;

export const AutomationActionOutcomeSchema = z.enum(['ok', 'failed']);
export type AutomationActionOutcome = z.infer<typeof AutomationActionOutcomeSchema>;

export const AutomationActivityActionSchema = z.object({
  action: AutomationActionSchema,
  outcome: AutomationActionOutcomeSchema,
});
export type AutomationActivityAction = z.infer<typeof AutomationActivityActionSchema>;

export const AutomationActivitySchema = z.object({
  id: AutomationActivityIdSchema,
  automationId: AutomationIdSchema,
  accountId: AccountIdSchema,
  threadId: ThreadIdSchema,
  messageId: MessageIdSchema,
  source: AutomationActivitySourceSchema,
  from: AddressSchema.nullable(),
  subject: z.string(),
  actions: z.array(AutomationActivityActionSchema),
  createdAt: IsoDateTimeSchema,
  undoneAt: IsoDateTimeSchema.nullable(),
});
export type AutomationActivity = z.infer<typeof AutomationActivitySchema>;

export const isReversibleAction = (action: AutomationAction): boolean =>
  MAIL_AUTOMATION_ACTION_TYPES.includes(action.type);

export const reversibleActionsOf = (activity: AutomationActivity): AutomationAction[] =>
  activity.actions
    .filter(({ action, outcome }) => outcome === 'ok' && isReversibleAction(action))
    .map(({ action }) => action);

export const isUndoableActivity = (activity: AutomationActivity): boolean =>
  activity.undoneAt === null && reversibleActionsOf(activity).length > 0;
