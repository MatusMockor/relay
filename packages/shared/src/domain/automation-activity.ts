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
  ReminderIdSchema,
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

export const AutomationActivityReminderSchema = z.object({
  id: ReminderIdSchema,
  remindAt: IsoDateTimeSchema,
});
export type AutomationActivityReminder = z.infer<typeof AutomationActivityReminderSchema>;

export const AutomationActivityActionSchema = z.object({
  action: AutomationActionSchema,
  outcome: AutomationActionOutcomeSchema,
  changed: z.array(MessageIdSchema).default([]),
  previousState: ThreadStateSchema.nullable().default(null),
  origins: z.array(MoveOriginRefSchema).default([]),
  labelled: z.array(MessageIdSchema).default([]),
  reminder: AutomationActivityReminderSchema.nullable().default(null),
  undo: AutomationUndoOutcomeSchema.nullable().default(null),
  reason: z.string().min(1).max(300).nullable().default(null),
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

export const hasRecordedChange = (entry: AutomationActivityAction): boolean =>
  entry.changed.length > 0 || entry.reminder !== null;

export const isPendingReversal = (entry: AutomationActivityAction): boolean =>
  entry.outcome === 'ok' &&
  hasRecordedChange(entry) &&
  isReversibleAction(entry.action) &&
  (entry.undo === null || entry.undo === 'failed');

export const isUndoableActivity = (activity: AutomationActivity): boolean =>
  activity.undoneAt === null && activity.actions.some(isPendingReversal);

export const countOkActions = (
  actions: readonly AutomationActivityAction[],
  type: AutomationAction['type'],
): number =>
  actions.filter(({ action, outcome }) => outcome === 'ok' && action.type === type).length;
