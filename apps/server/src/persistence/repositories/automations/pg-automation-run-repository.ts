import type { AutomationRun, AutomationRunRepository } from '@relay/engine';
import type { DbExecutor } from '../../database/database';
import { automationRuns } from '../../schema';
import { toDate } from '../../support/timestamps';

export class PgAutomationRunRepository implements AutomationRunRepository {
  constructor(private readonly db: DbExecutor) {}

  async claim(run: AutomationRun): Promise<boolean> {
    const inserted = await this.db
      .insert(automationRuns)
      .values({
        automationId: run.automationId,
        messageId: run.messageId,
        userId: run.userId,
        createdAt: toDate(run.createdAt),
      })
      .onConflictDoNothing()
      .returning({ automationId: automationRuns.automationId });
    return inserted.length > 0;
  }
}
