import { ConflictError, type ReminderRepository } from '@relay/engine';
import type { Reminder, ReminderId, ThreadId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { reminders } from '../../schema';
import { isUniqueViolation } from '../../support/postgres-errors';
import { assertOwned } from '../../support/ownership';
import { toDate } from '../../support/timestamps';
import { toReminder, toReminderInsert } from './reminder.mapper';

export class PgReminderRepository implements ReminderRepository {
  constructor(private readonly db: DbExecutor) {}

  async findActiveByThread(userId: UserId, threadId: ThreadId): Promise<Reminder | null> {
    const [row] = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.threadId, threadId),
          isNull(reminders.firedAt),
        ),
      );
    return row === undefined ? null : toReminder(row);
  }

  async listDue(now: string, limit: number): Promise<Reminder[]> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(and(isNull(reminders.firedAt), lte(reminders.remindAt, toDate(now))))
      .orderBy(asc(reminders.remindAt), asc(reminders.id))
      .limit(limit);
    return rows.map(toReminder);
  }

  async upsert(reminder: Reminder): Promise<Reminder> {
    try {
      return await this.db.transaction(async (tx) => {
        await assertOwned(tx, 'Thread', reminder.userId, reminder.threadId);
        return new PgReminderRepository(tx).write(reminder);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Thread already has an active reminder', { cause: error });
      }
      throw error;
    }
  }

  async markFired(reminderId: ReminderId, firedAt: string): Promise<void> {
    await this.db
      .update(reminders)
      .set({ firedAt: toDate(firedAt) })
      .where(and(eq(reminders.id, reminderId), isNull(reminders.firedAt)));
  }

  async delete(userId: UserId, reminderId: ReminderId): Promise<boolean> {
    const rows = await this.db
      .delete(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.id, reminderId)))
      .returning({ id: reminders.id });
    return rows.length > 0;
  }

  private async write(reminder: Reminder): Promise<Reminder> {
    const values = toReminderInsert(reminder);
    const [row] = await this.db
      .insert(reminders)
      .values(values)
      .onConflictDoUpdate({
        target: reminders.id,
        set: { remindAt: values.remindAt, firedAt: values.firedAt ?? null },
        setWhere: eq(reminders.userId, reminder.userId),
      })
      .returning();
    if (row === undefined) {
      throw new ConflictError(`Reminder ${reminder.id} belongs to another user`);
    }
    return toReminder(row);
  }
}
