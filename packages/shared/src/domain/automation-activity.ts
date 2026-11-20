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
import { ThreadStateSchema } from './thread';

export const AutomationActivitySourceSchema = z.enum(['live', 'apply']);
export type AutomationActivitySource = z.infer<typeof AutomationActivitySourceSchema>;

export const AutomationActionOutcomeSchema = z.enum(['ok', 'failed']);
export type AutomationActionOutcome = z.infer<typeof AutomationActionOutcomeSchema>;

export const AutomationUndoOutcomeSchema = z.enum(['undone', 'skipped', 'failed', 'notUndoable']);
export type AutomationUndoOutcome = z.infer<typeof AutomationUndoOutcomeSchema>;

export const MoveOriginRefSchema = z.object({
  messageId: MessageIdSchema,
  revision: z.string().min(1).max(200),
});
export type MoveOriginRef = z.infer<typeof MoveOriginRefSchema>;

export const AutomationActivityActionSchema = z.object({
  action: AutomationActionSchema,
  outcome: AutomationActionOutcomeSchema,
  changed: z.array(MessageIdSchema).default([]),
  previousState: ThreadStateSchema.nullable().default(null),
  origins: z.array(MoveOriginRefSchema).default([]),
  undo: AutomationUndoOutcomeSchema.nullable().default(null),
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

export const isPendingReversal = (entry: AutomationActivityAction): boolean =>
  entry.outcome === 'ok' &&
  entry.changed.length > 0 &&
  isReversibleAction(entry.action) &&
  (entry.undo === null || entry.undo === 'failed');

export const isUndoableActivity = (activity: AutomationActivity): boolean =>
  activity.undoneAt === null && activity.actions.some(isPendingReversal);
