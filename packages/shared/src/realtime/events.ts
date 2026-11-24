import { z } from 'zod';
import { AccountStatusSchema, MailAccountSchema } from '../domain/account';
import { AiJobSchema } from '../domain/ai';
import { AutomationEntriesSchema } from '../domain/automation-entry';
import { CalendarSourceKindSchema } from '../domain/calendar-event';
import { DraftSchema } from '../domain/draft';
import { HistoryProgressSchema } from '../domain/history-progress';
import { LabelSchema } from '../domain/label';
import { MailboxSchema } from '../domain/mailbox';
import {
  AccountIdSchema,
  AutomationIdSchema,
  DraftIdSchema,
  MailboxIdSchema,
  TaskSystemConnectionIdSchema,
  ThreadIdSchema,
} from '../domain/ids';
import { MessageSchema } from '../domain/message';
import { IsoDateTimeSchema } from '../domain/primitives';
import { ScheduledSendSchema } from '../domain/scheduled-send';
import { UserSettingsSchema } from '../domain/settings';
import { SplitEntriesSchema } from '../domain/split-entry';
import { TaskSchema } from '../domain/task';
import { ThreadSummarySchema } from '../domain/thread';

export const SyncPhaseSchema = z.enum(['connecting', 'mailboxes', 'messages', 'idle']);
export type SyncPhase = z.infer<typeof SyncPhaseSchema>;

export const SyncStageSchema = z.enum(['headers', 'inbox', 'backlog']);
export type SyncStage = z.infer<typeof SyncStageSchema>;

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

export const ThreadsChangedEventSchema = event(
  'threads.changed',
  z.object({ accountId: AccountIdSchema, count: z.number().int().nonnegative() }),
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
    stage: SyncStageSchema.optional().catch(undefined),
  }),
);

export const SyncHistoryEventSchema = event('sync.history', HistoryProgressSchema);

export const AccountUpsertedEventSchema = event(
  'account.upserted',
  z.object({ account: MailAccountSchema }),
);

export const AccountRemovedEventSchema = event(
  'account.removed',
  z.object({ accountId: AccountIdSchema }),
);

export const DraftUpsertedEventSchema = event('draft.upserted', z.object({ draft: DraftSchema }));

export const DraftRemovedEventSchema = event('draft.removed', z.object({ draftId: DraftIdSchema }));

export const ScheduledSendUpsertedEventSchema = event(
  'scheduledSend.upserted',
  z.object({ scheduledSend: ScheduledSendSchema }),
);

export const SplitsUpdatedEventSchema = event(
  'splits.updated',
  z.object({ splits: SplitEntriesSchema }),
);

export const AutomationsUpdatedEventSchema = event(
  'automations.updated',
  z.object({ automations: AutomationEntriesSchema }),
);

export const AutomationNotifiedEventSchema = event(
  'automation.notified',
  z.object({
    automationId: AutomationIdSchema,
    automationName: z.string().min(1),
    threadId: ThreadIdSchema,
    title: z.string().min(1),
    body: z.string(),
  }),
);

export const CalendarUpdatedEventSchema = event(
  'calendar.updated',
  z.object({ sourceKind: CalendarSourceKindSchema, sourceId: z.string().min(1) }),
);

export const MailboxesUpdatedEventSchema = event(
  'mailboxes.updated',
  z.object({ accountId: AccountIdSchema, mailboxes: z.array(MailboxSchema) }),
);

export const LabelsUpdatedEventSchema = event(
  'labels.updated',
  z.object({ accountId: AccountIdSchema, labels: z.array(LabelSchema) }),
);

export const TaskSystemsUpdatedEventSchema = event(
  'taskSystems.updated',
  z.object({ connectionId: TaskSystemConnectionIdSchema }),
);

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  ThreadUpsertedEventSchema,
  ThreadRemovedEventSchema,
  ThreadsChangedEventSchema,
  MessageUpsertedEventSchema,
  TaskUpsertedEventSchema,
  AccountStatusEventSchema,
  AiJobUpdatedEventSchema,
  SettingsUpdatedEventSchema,
  SyncProgressEventSchema,
  SyncHistoryEventSchema,
  AccountUpsertedEventSchema,
  AccountRemovedEventSchema,
  DraftUpsertedEventSchema,
  DraftRemovedEventSchema,
  ScheduledSendUpsertedEventSchema,
  SplitsUpdatedEventSchema,
  AutomationsUpdatedEventSchema,
  AutomationNotifiedEventSchema,
  CalendarUpdatedEventSchema,
  MailboxesUpdatedEventSchema,
  LabelsUpdatedEventSchema,
  TaskSystemsUpdatedEventSchema,
]);
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];
export type RealtimeEventOf<T extends RealtimeEventType> = Extract<RealtimeEvent, { type: T }>;
export type RealtimeEventData<T extends RealtimeEventType> = RealtimeEventOf<T>['data'];

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = RealtimeEventSchema.options.map(
  (option) => option.shape.type.value,
);
