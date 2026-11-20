import type {
  AutomationActivityRecord,
  AutomationActivityRepository,
  AutomationActivityRetention,
  AutomationActivityStats,
} from '@relay/engine';
import type {
  AutomationActivity,
  AutomationActivityId,
  AutomationId,
  UserId,
} from '@relay/shared/domain';
import { and, count, desc, eq, gte, isNull, lt, notInArray, sum } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import {
  toAutomationActivity,
  toAutomationActivityRow,
} from '../mappers/automation-activity-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { automationActivity as activity } from '../schema';

const NEWEST_FIRST = [desc(activity.createdTs), desc(activity.id)] as const;

const ofRule = (userId: UserId, automationId: AutomationId) =>
  and(eq(activity.userId, userId), eq(activity.automationId, automationId));

export class SqliteAutomationActivityRepository implements AutomationActivityRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  append(record: AutomationActivityRecord, retention: AutomationActivityRetention): Promise<void> {
    return this.executor.execute((db) => {
      db.insert(activity).values(toAutomationActivityRow(record)).run();
      const rule = eq(activity.automationId, record.automationId);
      db.delete(activity)
        .where(and(rule, lt(activity.createdTs, toTimestamp(retention.olderThan))))
        .run();
      const kept = db
        .select({ id: activity.id })
        .from(activity)
        .where(rule)
        .orderBy(...NEWEST_FIRST)
        .limit(retention.keep);
      db.delete(activity)
        .where(and(rule, notInArray(activity.id, kept)))
        .run();
    });
  }

  listRecent(
    userId: UserId,
    automationId: AutomationId,
    limit: number,
  ): Promise<AutomationActivity[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(activity)
        .where(ofRule(userId, automationId))
        .orderBy(...NEWEST_FIRST)
        .limit(limit)
        .all()
        .map(toAutomationActivity),
    );
  }

  listOpenSince(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivity[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(activity)
        .where(
          and(
            ofRule(userId, automationId),
            gte(activity.createdTs, toTimestamp(since)),
            isNull(activity.undoneAt),
          ),
        )
        .orderBy(...NEWEST_FIRST)
        .all()
        .map(toAutomationActivity),
    );
  }

  stats(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivityStats> {
    return this.executor.execute((db) => {
      const row = db
        .select({ runs: count(), failedActions: sum(activity.failedCount).mapWith(Number) })
        .from(activity)
        .where(and(ofRule(userId, automationId), gte(activity.createdTs, toTimestamp(since))))
        .get();
      return { runs: row?.runs ?? 0, failedActions: row?.failedActions ?? 0 };
    });
  }

  findById(userId: UserId, id: AutomationActivityId): Promise<AutomationActivity | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(activity)
        .where(and(eq(activity.userId, userId), eq(activity.id, id)))
        .get();
      return row === undefined ? null : toAutomationActivity(row);
    });
  }

  markUndone(userId: UserId, id: AutomationActivityId, at: string): Promise<boolean> {
    return this.executor.execute((db) => {
      const updated = db
        .update(activity)
        .set({ undoneAt: at })
        .where(and(eq(activity.userId, userId), eq(activity.id, id), isNull(activity.undoneAt)))
        .returning({ id: activity.id })
        .all();
      return updated.length > 0;
    });
  }
}
