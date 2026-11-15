import { type Reminder, ReminderSchema } from '@relay/shared/domain';
import type { ReminderRow, reminders } from '../schema';
import { toTimestamp } from './timestamp';

export const toReminder = (row: ReminderRow): Reminder =>
  ReminderSchema.parse({
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    remindAt: row.remindAt,
    firedAt: row.firedAt,
    createdAt: row.createdAt,
  });

export const toReminderRow = (reminder: Reminder): typeof reminders.$inferInsert => ({
  id: reminder.id,
  userId: reminder.userId,
  threadId: reminder.threadId,
  remindAt: reminder.remindAt,
  remindTs: toTimestamp(reminder.remindAt),
  firedAt: reminder.firedAt,
  createdAt: reminder.createdAt,
});
