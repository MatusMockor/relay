import type {
  AutomationActivity,
  AutomationActivityAction,
  AutomationActivityId,
  AutomationId,
  UserId,
} from '@relay/shared/domain';
import type {
  AutomationActivityRecord,
  AutomationActivityRepository,
  AutomationActivityRetention,
  AutomationActivityStats,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

const newestFirst = (left: AutomationActivity, right: AutomationActivity): number =>
  right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);

const publicOf = ({ userId: _userId, ...activity }: AutomationActivityRecord): AutomationActivity =>
  activity;

export class MemoryAutomationActivityRepository implements AutomationActivityRepository {
  constructor(private readonly db: MemoryDatabase) {}

  append(record: AutomationActivityRecord, retention: AutomationActivityRetention): Promise<void> {
    const rows = this.db.tables.automationActivity;
    rows.push(structuredClone(record));
    const kept = new Set(
      this.rowsOf(record.userId, record.automationId)
        .filter((row) => row.createdAt >= retention.olderThan)
        .slice(0, retention.keep),
    );
    const survivors = rows.filter(
      (row) => row.automationId !== record.automationId || kept.has(row),
    );
    rows.splice(0, rows.length, ...survivors);
    return Promise.resolve();
  }

  listRecent(
    userId: UserId,
    automationId: AutomationId,
    limit: number,
  ): Promise<AutomationActivity[]> {
    return Promise.resolve(this.rowsOf(userId, automationId).slice(0, limit).map(publicOf));
  }

  listOpenSince(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivity[]> {
    return Promise.resolve(
      this.rowsOf(userId, automationId)
        .filter((row) => row.undoneAt === null && row.createdAt >= since)
        .map(publicOf),
    );
  }

  stats(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<AutomationActivityStats> {
    const rows = this.rowsOf(userId, automationId).filter((row) => row.createdAt >= since);
    return Promise.resolve({
      runs: rows.length,
      failedActions: rows
        .flatMap((row) => row.actions)
        .filter((action) => action.outcome === 'failed').length,
    });
  }

  findById(userId: UserId, id: AutomationActivityId): Promise<AutomationActivity | null> {
    const row = this.db.tables.automationActivity.find(
      (item) => item.userId === userId && item.id === id,
    );
    return Promise.resolve(row === undefined ? null : publicOf(structuredClone(row)));
  }

  recordUndo(
    userId: UserId,
    id: AutomationActivityId,
    actions: readonly AutomationActivityAction[],
    undoneAt: string | null,
  ): Promise<boolean> {
    const rows = this.db.tables.automationActivity;
    const index = rows.findIndex(
      (item) => item.userId === userId && item.id === id && item.undoneAt === null,
    );
    const row = rows[index];
    if (row === undefined) {
      return Promise.resolve(false);
    }
    rows[index] = { ...row, actions: structuredClone([...actions]), undoneAt };
    return Promise.resolve(true);
  }

  private rowsOf(userId: UserId, automationId: AutomationId): AutomationActivityRecord[] {
    return this.db.tables.automationActivity
      .filter((row) => row.userId === userId && row.automationId === automationId)
      .sort(newestFirst);
  }
}
