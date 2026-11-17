import type { AutomationRun, AutomationRunRepository } from '@relay/engine';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { automationRuns } from '../schema';

export class SqliteAutomationRunRepository implements AutomationRunRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  claim(run: AutomationRun): Promise<boolean> {
    return this.executor.execute((db) => {
      const inserted = db
        .insert(automationRuns)
        .values({
          automationId: run.automationId,
          messageId: run.messageId,
          userId: run.userId,
          createdAt: run.createdAt,
        })
        .onConflictDoNothing()
        .returning({ automationId: automationRuns.automationId })
        .all();
      return inserted.length > 0;
    });
  }
}
