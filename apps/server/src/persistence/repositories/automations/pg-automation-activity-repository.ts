import type {
  AutomationActivityRecord,
  AutomationActivityRepository,
  AutomationActivityRetention,
  AutomationActivityStats,
} from '@relay/engine';
import type {
  AutomationActivity,
  AutomationActivityAction,
  AutomationActivityId,
  AutomationId,
  UserId,
} from '@relay/shared/domain';
import { and, count, desc, eq, gte, isNull, lt, notInArray, sum } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { automationActivity as activity } from '../../schema';
import { toDate, toDateOrNull } from '../../support/timestamps';
import { toAutomationActivity, toAutomationActivityInsert } from './automation-activity.mapper';

const NEWEST_FIRST = [desc(activity.createdAt), desc(activity.id)] as const;

export class PgAutomationActivityRepository implements AutomationActivityRepository {
  constructor(private readonly db: DbExecutor) {}

  async append(
    record: AutomationActivityRecord,
    retention: AutomationActivityRetention,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(activity).values(toAutomationActivityInsert(record));
      const ofRule = and(
        eq(activity.userId, record.userId),
        eq(activity.automationId, record.automationId),
      );
      await tx
        .delete(activity)
        .where(and(ofRule, lt(activity.createdAt, toDate(retention.olderThan))));
      const kept = tx
        .select({ id: activity.id })
        .from(activity)
        .where(ofRule)
        .orderBy(...NEWEST_FIRST)
        .limit(retention.keep);
      await tx.delete(activity).where(and(ofRule, notInArray(activity.id, kept)));
    });
  }

  async listRecent(
    userId: UserId,
    automationId: AutomationId,
    limit: number,
  ): Promise<AutomationActivity[]> {
    const rows = await this.db
      .select()
      .from(activity)
      .where(and(eq(activity.userId, userId), eq(activity.automationId, automationId)))
      .orderBy(...NEWEST_FIRST)
      .limit(limit);
    return rows.map(toAutomationActivity);
  }

  async listOpenSince(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivity[]> {
    const rows = await this.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.userId, userId),
          eq(activity.automationId, automationId),
          gte(activity.createdAt, toDate(since)),
          isNull(activity.undoneAt),
        ),
      )
      .orderBy(...NEWEST_FIRST);
    return rows.map(toAutomationActivity);
  }

  async stats(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivityStats> {
    const [row] = await this.db
      .select({ runs: count(), failedActions: sum(activity.failedCount).mapWith(Number) })
      .from(activity)
      .where(
        and(
          eq(activity.userId, userId),
          eq(activity.automationId, automationId),
          gte(activity.createdAt, toDate(since)),
        ),
      );
    return { runs: row?.runs ?? 0, failedActions: row?.failedActions ?? 0 };
  }

  async findById(userId: UserId, id: AutomationActivityId): Promise<AutomationActivity | null> {
    const [row] = await this.db
      .select()
      .from(activity)
      .where(and(eq(activity.userId, userId), eq(activity.id, id)));
    return row === undefined ? null : toAutomationActivity(row);
  }

  async recordUndo(
    userId: UserId,
    id: AutomationActivityId,
    actions: readonly AutomationActivityAction[],
    undoneAt: string | null,
  ): Promise<boolean> {
    const updated = await this.db
      .update(activity)
      .set({ actions: [...actions], undoneAt: toDateOrNull(undoneAt) })
      .where(and(eq(activity.userId, userId), eq(activity.id, id), isNull(activity.undoneAt)))
      .returning({ id: activity.id });
    return updated.length > 0;
  }
}
