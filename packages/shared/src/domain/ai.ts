import { z } from 'zod';
import {
  AiJobIdSchema,
  AiResultIdSchema,
  AutomationIdSchema,
  DraftIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
  UserIdSchema,
} from './ids';
import { AiEffortSchema, AiModelIdSchema } from './ai-model-catalog';
import { IsoDateTimeSchema, JiraKeySchema } from './primitives';
import { ChecklistItemSchema, ReplySuggestionSchema } from './thread';
import { TimeZoneSchema } from './time-zone';

export const AiRunnerKindSchema = z.enum(['claude', 'codex']);
export type AiRunnerKind = z.infer<typeof AiRunnerKindSchema>;

export const AiRunnerLocationSchema = z.enum(['server', 'local']);
export type AiRunnerLocation = z.infer<typeof AiRunnerLocationSchema>;

export const AiTaskKindSchema = z.enum([
  'oneLiner',
  'summary',
  'replySuggestions',
  'chatAnswer',
  'rewrite',
  'createTask',
  'automationTask',
]);
export type AiTaskKind = z.infer<typeof AiTaskKindSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

const SourceMessageIdSchema = MessageIdSchema.nullable().optional();
const JobTimeZoneSchema = TimeZoneSchema.nullable().optional();

export const AiJobInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('oneLiner'),
    threadId: ThreadIdSchema,
    sourceMessageId: SourceMessageIdSchema,
    timeZone: JobTimeZoneSchema,
  }),
  z.object({
    kind: z.literal('summary'),
    threadId: ThreadIdSchema,
    sourceMessageId: SourceMessageIdSchema,
    timeZone: JobTimeZoneSchema,
  }),
  z.object({
    kind: z.literal('replySuggestions'),
    threadId: ThreadIdSchema,
    sourceMessageId: SourceMessageIdSchema,
    timeZone: JobTimeZoneSchema,
  }),
  z.object({
    kind: z.literal('chatAnswer'),
    question: z.string().min(1).max(10_000),
    threadId: ThreadIdSchema.nullable(),
    history: z.array(ChatTurnSchema),
    timeZone: JobTimeZoneSchema,
  }),
  z.object({
    kind: z.literal('rewrite'),
    text: z.string().min(1),
    instruction: z.string().min(1).max(2_000),
    draftId: DraftIdSchema.nullable(),
  }),
  z.object({
    kind: z.literal('createTask'),
    threadId: ThreadIdSchema,
    hint: z.string().min(1).max(2_000).nullable(),
    timeZone: JobTimeZoneSchema,
  }),
  z.object({
    kind: z.literal('automationTask'),
    threadId: ThreadIdSchema,
    messageId: MessageIdSchema,
    automationId: AutomationIdSchema,
    instructions: z.string().min(1).max(2_000).nullable(),
    jiraKey: JiraKeySchema.nullable(),
    timeZone: JobTimeZoneSchema,
  }),
]);
export type AiJobInput = z.infer<typeof AiJobInputSchema>;

export const AiOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('oneLiner'), text: z.string().min(1) }),
  z.object({
    kind: z.literal('summary'),
    summary: z.string().min(1),
    checklist: z.array(ChecklistItemSchema),
  }),
  z.object({ kind: z.literal('replySuggestions'), suggestions: z.array(ReplySuggestionSchema) }),
  z.object({
    kind: z.literal('chatAnswer'),
    text: z.string().min(1),
    references: z.array(ThreadIdSchema).max(20).default([]),
  }),
  z.object({ kind: z.literal('rewrite'), text: z.string().min(1) }),
  z.object({
    kind: z.literal('createTask'),
    threadId: ThreadIdSchema,
    title: z.string().min(1).max(500),
    aiWhat: z.string().min(1).max(2_000),
  }),
  z.object({
    kind: z.literal('automationTask'),
    threadId: ThreadIdSchema,
    actionable: z.boolean(),
    title: z.string().max(500),
    description: z.string().max(2_000),
  }),
]);
export type AiOutput = z.infer<typeof AiOutputSchema>;
export type AiOutputOf<K extends AiTaskKind> = Extract<AiOutput, { kind: K }>;

export const AiResultSchema = z.object({
  id: AiResultIdSchema,
  userId: UserIdSchema,
  threadId: ThreadIdSchema.nullable(),
  sourceMessageId: MessageIdSchema.nullable().default(null),
  runner: AiRunnerKindSchema,
  output: AiOutputSchema,
  createdAt: IsoDateTimeSchema,
});
export type AiResult = z.infer<typeof AiResultSchema>;

export const AiJobStatusSchema = z.enum(['queued', 'running', 'done', 'error']);
export type AiJobStatus = z.infer<typeof AiJobStatusSchema>;

export const AiJobSchema = z.object({
  id: AiJobIdSchema,
  userId: UserIdSchema,
  kind: AiTaskKindSchema,
  status: AiJobStatusSchema,
  runnerLocation: AiRunnerLocationSchema,
  runner: AiRunnerKindSchema,
  model: AiModelIdSchema.nullable().optional(),
  effort: AiEffortSchema.nullable().optional(),
  input: AiJobInputSchema,
  output: AiOutputSchema.nullable(),
  error: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type AiJob = z.infer<typeof AiJobSchema>;

export const AiFailureCodeSchema = z.enum([
  'not_installed',
  'not_authenticated',
  'timeout',
  'cancelled',
  'invalid_output',
  'process_failed',
]);
export type AiFailureCode = z.infer<typeof AiFailureCodeSchema>;

export const AiEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), runner: AiRunnerKindSchema }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('toolCall'), name: z.string().min(1) }),
  z.object({ type: z.literal('completed'), output: AiOutputSchema }),
  z.object({ type: z.literal('failed'), code: AiFailureCodeSchema, message: z.string() }),
]);
export type AiEvent = z.infer<typeof AiEventSchema>;

export const AiRunnerInfoSchema = z.object({
  runner: AiRunnerKindSchema,
  location: AiRunnerLocationSchema,
  installed: z.boolean(),
  authenticated: z.boolean().nullable(),
  version: z.string().nullable(),
  executablePath: z.string().nullable(),
});
export type AiRunnerInfo = z.infer<typeof AiRunnerInfoSchema>;
