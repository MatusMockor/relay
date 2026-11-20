import { z } from 'zod';
import { LabelIdSchema, MailboxIdSchema } from './ids';
import { EmailAddressSchema } from './primitives';

export const SimpleAutomationActionTypeSchema = z.enum([
  'summary',
  'task',
  'draftReply',
  'notify',
  'markRead',
  'pin',
  'archive',
]);
export type SimpleAutomationActionType = z.infer<typeof SimpleAutomationActionTypeSchema>;

export const MIN_REMIND_DAYS = 1;
export const MAX_REMIND_DAYS = 30;

export const RemindAfterDaysSchema = z.number().int().min(MIN_REMIND_DAYS).max(MAX_REMIND_DAYS);

export const AutomationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: SimpleAutomationActionTypeSchema }),
  z.object({ type: z.literal('moveTo'), mailboxId: MailboxIdSchema }),
  z.object({ type: z.literal('addLabel'), labelId: LabelIdSchema }),
  z.object({ type: z.literal('remind'), afterDays: RemindAfterDaysSchema }),
  z.object({ type: z.literal('forward'), to: EmailAddressSchema }),
]);
export type AutomationAction = z.infer<typeof AutomationActionSchema>;
export type AutomationActionType = AutomationAction['type'];
export type AutomationActionOf<Type extends AutomationActionType> = Extract<
  AutomationAction,
  { type: Type }
>;

export const PLACEMENT_ACTION_TYPES: readonly AutomationActionType[] = [
  'remind',
  'moveTo',
  'archive',
];

const actionKey = (action: AutomationAction): string => {
  if (action.type === 'addLabel') {
    return `addLabel:${action.labelId}`;
  }
  return action.type;
};

export const automationActionsIssue = (actions: readonly AutomationAction[]): string | null => {
  if (new Set(actions.map(actionKey)).size !== actions.length) {
    return 'Actions must be unique';
  }
  const placements = actions.filter((action) => PLACEMENT_ACTION_TYPES.includes(action.type));
  if (placements.length > 1) {
    return 'An automation can only remind, move or archive, not combine them';
  }
  return null;
};

export const AutomationActionsSchema = z
  .array(AutomationActionSchema)
  .min(1)
  .superRefine((actions, context) => {
    const issue = automationActionsIssue(actions);
    if (issue !== null) {
      context.addIssue({ code: 'custom', message: issue });
    }
  });

const upgradeLegacyAction = (action: unknown): unknown =>
  typeof action === 'string' ? { type: action } : action;

export const AutomationActionsInputSchema = z.preprocess(
  (actions) => (Array.isArray(actions) ? actions.map(upgradeLegacyAction) : actions),
  AutomationActionsSchema,
);

export const MAIL_AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  'markRead',
  'pin',
  'addLabel',
  'remind',
  'moveTo',
  'archive',
];

export const LIVE_ONLY_AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  'draftReply',
  'forward',
];

export const isParameterizedAction = (
  action: AutomationAction,
): action is AutomationActionOf<'moveTo' | 'addLabel'> =>
  action.type === 'moveTo' || action.type === 'addLabel';

export const needsAccountScope = (action: AutomationAction): boolean =>
  isParameterizedAction(action) || action.type === 'forward';
