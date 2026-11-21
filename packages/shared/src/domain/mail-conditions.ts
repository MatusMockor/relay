import { z } from 'zod';
import { JiraEventKindSchema } from './jira-event';
import { EmailAddressSchema } from './primitives';

export const FromDomainRuleSchema = z.object({
  type: z.literal('fromDomain'),
  domain: z.string().min(1).max(255),
});

export const FromAddressRuleSchema = z.object({
  type: z.literal('fromAddress'),
  address: EmailAddressSchema,
});

export const SubjectRegexRuleSchema = z.object({
  type: z.literal('subjectRegex'),
  pattern: z.string().min(1).max(500),
  caseSensitive: z.boolean(),
});

export const HeaderRuleSchema = z.object({
  type: z.literal('header'),
  name: z.string().min(1).max(200),
  pattern: z.string().min(1).max(500),
});

export const JiraRuleSchema = z.object({
  type: z.literal('jira'),
  projectKeys: z.array(z.string().regex(/^[A-Z][A-Z0-9_]+$/)),
});

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

export const AutomationMatchModeSchema = z.enum(['all', 'any']);
export type AutomationMatchMode = z.infer<typeof AutomationMatchModeSchema>;

export const MAX_AUTOMATION_CONDITIONS = 20;
