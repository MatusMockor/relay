import {
  AccountIdSchema,
  DraftIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
  MessageIdSchema,
  ScheduledSendIdSchema,
  SplitIdSchema,
  TaskIdSchema,
  ThreadIdSchema,
  UserIdSchema,
} from '@relay/shared';

export const demoIds = {
  user: UserIdSchema.parse('demo-user'),
  account: (key: string) => AccountIdSchema.parse(`acc-${key}`),
  mailbox: (key: string) => MailboxIdSchema.parse(`mbx-${key}-inbox`),
  thread: (key: string) => ThreadIdSchema.parse(key),
  message: (key: string) => MessageIdSchema.parse(key),
  label: (key: string) => LabelIdSchema.parse(`lbl-${key}`),
  split: (key: string) => SplitIdSchema.parse(`split-${key}`),
  task: (key: string) => TaskIdSchema.parse(`task-${key}`),
  draft: (key: string) => DraftIdSchema.parse(`draft-${key}`),
  scheduled: (key: string) => ScheduledSendIdSchema.parse(`sched-${key}`),
};
