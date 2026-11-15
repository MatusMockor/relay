import type { ReminderRepository } from '@relay/engine';
import type { Reminder, ReminderId, ThreadId, UserId } from '@relay/shared/domain';
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toReminder, toReminderRow } from '../mappers/reminder-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { assertPageLimit } from '../pagination/page-limit';
import { reminders } from '../schema';

export class SqliteReminderRepository implements ReminderRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findActiveByThread(userId: UserId, threadId: ThreadId): Promise<Reminder | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(reminders)
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.threadId, threadId),
            isNull(reminders.firedAt),
          ),
        )
        .orderBy(desc(reminders.createdAt), desc(reminders.id))
        .get();
      return row === undefined ? null : toReminder(row);
    });
  }

  listDue(now: string, limit: number): Promise<Reminder[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(reminders)
        .where(and(isNull(reminders.firedAt), lte(reminders.remindTs, toTimestamp(now))))
        .orderBy(asc(reminders.remindTs), asc(reminders.id))
        .limit(assertPageLimit(limit))
        .all()
        .map(toReminder),
    );
  }

  upsert(reminder: Reminder): Promise<Reminder> {
    return this.executor.execute((db) => {
      const row = toReminderRow(reminder);
      const { id: _id, ...changes } = row;
      db.insert(reminders)
        .values(row)
        .onConflictDoUpdate({ target: reminders.id, set: changes })
        .run();
      return reminder;
    });
  }

  markFired(reminderId: ReminderId, firedAt: string): Promise<void> {
    return this.executor.execute((db) => {
      db.update(reminders).set({ firedAt }).where(eq(reminders.id, reminderId)).run();
    });
  }

  delete(userId: UserId, reminderId: ReminderId): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .delete(reminders)
          .where(and(eq(reminders.userId, userId), eq(reminders.id, reminderId)))
          .run().changes > 0,
    );
  }
}
