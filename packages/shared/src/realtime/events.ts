import { z } from 'zod';
import { AccountStatusSchema } from '../domain/account';
import { AiJobSchema } from '../domain/ai';
import { AccountIdSchema, MailboxIdSchema, ThreadIdSchema } from '../domain/ids';
import { MessageSchema } from '../domain/message';
import { IsoDateTimeSchema } from '../domain/primitives';
import { UserSettingsSchema } from '../domain/settings';
import { TaskSchema } from '../domain/task';
import { ThreadSummarySchema } from '../domain/thread';

export const SyncPhaseSchema = z.enum(['connecting', 'mailboxes', 'messages', 'idle']);
export type SyncPhase = z.infer<typeof SyncPhaseSchema>;

const event = <const Type extends string, Data extends z.ZodType>(type: Type, data: Data) =>
  z.object({ type: z.literal(type), at: IsoDateTimeSchema, data });

export const ThreadUpsertedEventSchema = event(
  'thread.upserted',
  z.object({ thread: ThreadSummarySchema }),
);

export const ThreadRemovedEventSchema = event(
  'thread.removed',
  z.object({ threadId: ThreadIdSchema, accountId: AccountIdSchema }),
);

export const MessageUpsertedEventSchema = event(
  'message.upserted',
  z.object({ message: MessageSchema }),
);

export const TaskUpsertedEventSchema = event('task.upserted', z.object({ task: TaskSchema }));

export const AccountStatusEventSchema = event(
  'account.status',
  z.object({
    accountId: AccountIdSchema,
    status: AccountStatusSchema,
    lastSyncedAt: IsoDateTimeSchema.nullable(),
    error: z.string().nullable(),
  }),
);

export const AiJobUpdatedEventSchema = event('ai.job.updated', z.object({ job: AiJobSchema }));

export const SettingsUpdatedEventSchema = event(
  'settings.updated',
  z.object({ settings: UserSettingsSchema }),
);

export const SyncProgressEventSchema = event(
  'sync.progress',
  z.object({
    accountId: AccountIdSchema,
    mailboxId: MailboxIdSchema.nullable(),
    phase: SyncPhaseSchema,
    processed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().nullable(),
  }),
);

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  ThreadUpsertedEventSchema,
  ThreadRemovedEventSchema,
  MessageUpsertedEventSchema,
  TaskUpsertedEventSchema,
  AccountStatusEventSchema,
  AiJobUpdatedEventSchema,
  SettingsUpdatedEventSchema,
  SyncProgressEventSchema,
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];
export type RealtimeEventOf<T extends RealtimeEventType> = Extract<RealtimeEvent, { type: T }>;
export type RealtimeEventData<T extends RealtimeEventType> = RealtimeEventOf<T>['data'];

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = RealtimeEventSchema.options.map(
  (option) => option.shape.type.value,
);
