import { z } from 'zod';
import { LabelIdSchema, MailboxIdSchema } from './ids';

export const SimpleAutomationActionTypeSchema = z.enum([
  'summary',
  'task',
  'notify',
  'markRead',
  'pin',
  'archive',
]);
export type SimpleAutomationActionType = z.infer<typeof SimpleAutomationActionTypeSchema>;

export const AutomationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: SimpleAutomationActionTypeSchema }),
  z.object({ type: z.literal('moveTo'), mailboxId: MailboxIdSchema }),
  z.object({ type: z.literal('addLabel'), labelId: LabelIdSchema }),
]);
export type AutomationAction = z.infer<typeof AutomationActionSchema>;
export type AutomationActionType = AutomationAction['type'];
export type AutomationActionOf<Type extends AutomationActionType> = Extract<
  AutomationAction,
  { type: Type }
>;

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
  const types = new Set(actions.map((action) => action.type));
  if (types.has('moveTo') && types.has('archive')) {
    return 'An automation cannot both move and archive';
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
  'moveTo',
  'archive',
];

export const isParameterizedAction = (
  action: AutomationAction,
): action is AutomationActionOf<'moveTo' | 'addLabel'> =>
  action.type === 'moveTo' || action.type === 'addLabel';
