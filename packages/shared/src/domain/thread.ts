import { z } from 'zod';
import { AddressSchema } from './address';
import { AccountIdSchema, LabelIdSchema, SplitIdSchema, ThreadIdSchema } from './ids';
import { MessageSchema } from './message';
import { IsoDateTimeSchema, JiraKeySchema } from './primitives';

export const ThreadStateSchema = z.enum(['inbox', 'done', 'trash', 'reminder']);
export type ThreadState = z.infer<typeof ThreadStateSchema>;

export const ThreadSummarySchema = z.object({
  id: ThreadIdSchema,
  accountId: AccountIdSchema,
  subject: z.string(),
  participants: z.array(AddressSchema),
  lastMessageAt: IsoDateTimeSchema,
  messageCount: z.number().int().positive(),
  unread: z.boolean(),
  snippet: z.string(),
  aiOneLiner: z.string().nullable(),
  jiraKey: JiraKeySchema.nullable(),
  splitIds: z.array(SplitIdSchema),
  labelIds: z.array(LabelIdSchema),
  state: ThreadStateSchema,
  remindAt: IsoDateTimeSchema.nullable(),
  hasDraft: z.boolean(),
});
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ReplySuggestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  body: z.string().min(1),
});
export type ReplySuggestion = z.infer<typeof ReplySuggestionSchema>;

export const ThreadDetailSchema = z.object({
  thread: ThreadSummarySchema,
  messages: z.array(MessageSchema),
  aiSummary: z.string().nullable(),
  checklist: z.array(ChecklistItemSchema),
  replySuggestions: z.array(ReplySuggestionSchema),
});
export type ThreadDetail = z.infer<typeof ThreadDetailSchema>;
