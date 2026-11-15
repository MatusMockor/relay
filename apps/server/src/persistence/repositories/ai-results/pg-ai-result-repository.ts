import {
  type AiResultRepository,
  applyChecklistChange,
  type ChecklistItemChange,
} from '@relay/engine';
import type { AiResult, AiResultId, AiTaskKind, ThreadId, UserId } from '@relay/shared/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { aiResults } from '../../schema';
import { assertOwned } from '../../support/ownership';
import { toAiResult, toAiResultInsert } from './ai-result.mapper';

export class PgAiResultRepository implements AiResultRepository {
  constructor(private readonly db: DbExecutor) {}

  async findLatest(userId: UserId, threadId: ThreadId, kind: AiTaskKind): Promise<AiResult | null> {
    const [row] = await this.db
      .select()
      .from(aiResults)
      .where(
        and(
          eq(aiResults.userId, userId),
          eq(aiResults.threadId, threadId),
          eq(aiResults.kind, kind),
        ),
      )
      .orderBy(desc(aiResults.createdAt), desc(aiResults.id))
      .limit(1);
    return row === undefined ? null : toAiResult(row);
  }

  async save(result: AiResult): Promise<AiResult> {
    const values = toAiResultInsert(result);
    await this.db.transaction(async (tx) => {
      await assertOwned(tx, 'Thread', result.userId, result.threadId);
      await tx
        .insert(aiResults)
        .values(values)
        .onConflictDoUpdate({
          target: aiResults.id,
          set: { kind: values.kind, runner: values.runner, output: values.output },
          setWhere: eq(aiResults.userId, result.userId),
        });
    });
    return result;
  }

  async updateChecklistItem(
    userId: UserId,
    resultId: AiResultId,
    change: ChecklistItemChange,
  ): Promise<AiResult | null> {
    const owned = and(eq(aiResults.userId, userId), eq(aiResults.id, resultId));
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(aiResults).where(owned).for('update');
      const output =
        current === undefined ? null : applyChecklistChange(toAiResult(current).output, change);
      if (output === null) {
        return null;
      }
      const [row] = await tx.update(aiResults).set({ output }).where(owned).returning();
      return row === undefined ? null : toAiResult(row);
    });
  }

  async deleteByThread(threadId: ThreadId): Promise<void> {
    await this.db.delete(aiResults).where(eq(aiResults.threadId, threadId));
  }
}
