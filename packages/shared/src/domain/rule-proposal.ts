import { z } from 'zod';
import { RemindAfterDaysSchema, SimpleAutomationActionTypeSchema } from './automation-action';
import {
  AutomationConditionSchema,
  AutomationMatchModeSchema,
  MAX_AUTOMATION_CONDITIONS,
} from './automation-condition';
import { RULE_SUGGEST_MAX_ACTIONS } from './rule-suggestion';

const ProposedTargetSchema = z.string().trim().min(1).max(200);

export const ProposedActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: SimpleAutomationActionTypeSchema }),
  z.strictObject({ type: z.literal('addLabel'), label: ProposedTargetSchema }),
  z.strictObject({ type: z.literal('moveTo'), folder: ProposedTargetSchema }),
  z.strictObject({ type: z.literal('remind'), afterDays: RemindAfterDaysSchema }),
  z.strictObject({ type: z.literal('forward'), to: z.string().trim().min(3).max(320) }),
]);
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const RuleProposalSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  accountId: z.string().trim().min(1).max(200).nullable(),
  match: AutomationMatchModeSchema,
  conditions: z.array(AutomationConditionSchema).max(MAX_AUTOMATION_CONDITIONS),
  exceptions: z.array(AutomationConditionSchema).max(MAX_AUTOMATION_CONDITIONS),
  actions: z.array(ProposedActionSchema).max(RULE_SUGGEST_MAX_ACTIONS),
  understood: z.string().trim().min(1).max(600),
  unmapped: z.array(z.string().trim().min(1).max(200)).max(10),
});
export type RuleProposal = z.infer<typeof RuleProposalSchema>;
