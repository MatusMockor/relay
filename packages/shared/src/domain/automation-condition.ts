import { z } from 'zod';
import {
  FromAddressRuleSchema,
  FromDomainRuleSchema,
  HasAttachmentConditionSchema,
  HeaderRuleSchema,
  JiraEventConditionSchema,
  JiraRuleSchema,
  RecipientConditionSchema,
  SubjectContainsConditionSchema,
  SubjectRegexRuleSchema,
} from './mail-conditions';

export {
  AutomationMatchModeSchema,
  type AutomationMatchMode,
  HasAttachmentConditionSchema,
  JiraEventConditionSchema,
  MAX_AUTOMATION_CONDITIONS,
  RecipientConditionSchema,
  type RecipientField,
  RecipientFieldSchema,
  SubjectContainsConditionSchema,
} from './mail-conditions';

export const AutomationConditionSchema = z.discriminatedUnion('type', [
  FromDomainRuleSchema,
  FromAddressRuleSchema,
  SubjectRegexRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  JiraEventConditionSchema,
  RecipientConditionSchema,
  HasAttachmentConditionSchema,
  SubjectContainsConditionSchema,
]);
export type AutomationCondition = z.infer<typeof AutomationConditionSchema>;
export type AutomationConditionType = AutomationCondition['type'];
