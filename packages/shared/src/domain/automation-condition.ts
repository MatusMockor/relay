import { z } from 'zod';
import { JiraEventKindSchema } from './jira-event';
import {
  FromAddressRuleSchema,
  FromDomainRuleSchema,
  HeaderRuleSchema,
  JiraRuleSchema,
  SubjectRegexRuleSchema,
} from './split';

export const JiraEventConditionSchema = z.object({
  type: z.literal('jiraEvent'),
  kind: JiraEventKindSchema,
});

export const RecipientFieldSchema = z.enum(['to', 'cc', 'any']);
export type RecipientField = z.infer<typeof RecipientFieldSchema>;

export const RecipientConditionSchema = z.object({
  type: z.literal('recipient'),
  field: RecipientFieldSchema,
  match: z.enum(['address', 'domain']),
  value: z.string().trim().min(1).max(255),
});

export const HasAttachmentConditionSchema = z.object({
  type: z.literal('hasAttachment'),
});

export const SubjectContainsConditionSchema = z.object({
  type: z.literal('subjectContains'),
  value: z.string().trim().min(1).max(200),
});

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

export const AutomationMatchModeSchema = z.enum(['all', 'any']);
export type AutomationMatchMode = z.infer<typeof AutomationMatchModeSchema>;

export const MAX_AUTOMATION_CONDITIONS = 20;
