import type { Reminder } from '@relay/shared/domain';
import type { reminders } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

type ReminderRow = typeof reminders.$inferSelect;
type ReminderInsert = typeof reminders.$inferInsert;

export const toReminder = (row: ReminderRow): Reminder => ({
  id: row.id,
  userId: row.userId,
  threadId: row.threadId,
  remindAt: toIso(row.remindAt),
  firedAt: toIsoOrNull(row.firedAt),
  createdAt: toIso(row.createdAt),
});

export const toReminderInsert = (reminder: Reminder): ReminderInsert => ({
  id: reminder.id,
  userId: reminder.userId,
  threadId: reminder.threadId,
  remindAt: toDate(reminder.remindAt),
  firedAt: toDateOrNull(reminder.firedAt),
  createdAt: toDate(reminder.createdAt),
});
