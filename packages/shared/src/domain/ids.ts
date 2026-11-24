import { z } from 'zod';

const EntityIdBaseSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export const UserIdSchema = EntityIdBaseSchema.brand<'UserId'>();
export const DeviceIdSchema = EntityIdBaseSchema.brand<'DeviceId'>();
export const AccountIdSchema = EntityIdBaseSchema.brand<'AccountId'>();
export const MailboxIdSchema = EntityIdBaseSchema.brand<'MailboxId'>();
export const ThreadIdSchema = EntityIdBaseSchema.brand<'ThreadId'>();
export const MessageIdSchema = EntityIdBaseSchema.brand<'MessageId'>();
export const AttachmentIdSchema = EntityIdBaseSchema.brand<'AttachmentId'>();
export const LabelIdSchema = EntityIdBaseSchema.brand<'LabelId'>();
export const SplitIdSchema = EntityIdBaseSchema.brand<'SplitId'>();
export const TaskIdSchema = EntityIdBaseSchema.brand<'TaskId'>();
export const ReminderIdSchema = EntityIdBaseSchema.brand<'ReminderId'>();
export const DraftIdSchema = EntityIdBaseSchema.brand<'DraftId'>();
export const ScheduledSendIdSchema = EntityIdBaseSchema.brand<'ScheduledSendId'>();
export const AiJobIdSchema = EntityIdBaseSchema.brand<'AiJobId'>();
export const AiResultIdSchema = EntityIdBaseSchema.brand<'AiResultId'>();
export const CalendarEventIdSchema = EntityIdBaseSchema.brand<'CalendarEventId'>();
export const CalendarSubscriptionIdSchema = EntityIdBaseSchema.brand<'CalendarSubscriptionId'>();
export const CalendarConnectionIdSchema = EntityIdBaseSchema.brand<'CalendarConnectionId'>();
export const GoogleCalendarIdSchema = EntityIdBaseSchema.brand<'GoogleCalendarId'>();
export const AutomationIdSchema = EntityIdBaseSchema.brand<'AutomationId'>();
export const AutomationActivityIdSchema = EntityIdBaseSchema.brand<'AutomationActivityId'>();
export const TaskSystemConnectionIdSchema = EntityIdBaseSchema.brand<'TaskSystemConnectionId'>();

export type UserId = z.infer<typeof UserIdSchema>;
export type DeviceId = z.infer<typeof DeviceIdSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type MailboxId = z.infer<typeof MailboxIdSchema>;
export type ThreadId = z.infer<typeof ThreadIdSchema>;
export type MessageId = z.infer<typeof MessageIdSchema>;
export type AttachmentId = z.infer<typeof AttachmentIdSchema>;
export type LabelId = z.infer<typeof LabelIdSchema>;
export type SplitId = z.infer<typeof SplitIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type ReminderId = z.infer<typeof ReminderIdSchema>;
export type DraftId = z.infer<typeof DraftIdSchema>;
export type ScheduledSendId = z.infer<typeof ScheduledSendIdSchema>;
export type AiJobId = z.infer<typeof AiJobIdSchema>;
export type AiResultId = z.infer<typeof AiResultIdSchema>;
export type CalendarEventId = z.infer<typeof CalendarEventIdSchema>;
export type CalendarSubscriptionId = z.infer<typeof CalendarSubscriptionIdSchema>;
export type CalendarConnectionId = z.infer<typeof CalendarConnectionIdSchema>;
export type GoogleCalendarId = z.infer<typeof GoogleCalendarIdSchema>;
export type AutomationId = z.infer<typeof AutomationIdSchema>;
export type AutomationActivityId = z.infer<typeof AutomationActivityIdSchema>;
export type TaskSystemConnectionId = z.infer<typeof TaskSystemConnectionIdSchema>;

export interface EntityIdMap {
  user: UserId;
  device: DeviceId;
  account: AccountId;
  mailbox: MailboxId;
  thread: ThreadId;
  message: MessageId;
  attachment: AttachmentId;
  label: LabelId;
  split: SplitId;
  task: TaskId;
  reminder: ReminderId;
  draft: DraftId;
  scheduledSend: ScheduledSendId;
  aiJob: AiJobId;
  aiResult: AiResultId;
  calendarEvent: CalendarEventId;
  calendarSubscription: CalendarSubscriptionId;
  calendarConnection: CalendarConnectionId;
  googleCalendar: GoogleCalendarId;
  automation: AutomationId;
  automationActivity: AutomationActivityId;
  taskSystemConnection: TaskSystemConnectionId;
}

export type EntityKind = keyof EntityIdMap;
