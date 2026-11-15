import {
  type AiResultRepository,
  applyChecklistChange,
  type ChecklistItemChange,
} from '@relay/engine';
import type { AiResult, AiResultId, AiTaskKind, ThreadId, UserId } from '@relay/shared/domain';
import { and, desc, eq } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toAiResult, toAiResultRow } from '../mappers/ai-mapper';
import { aiResults } from '../schema';

export class SqliteAiResultRepository implements AiResultRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findLatest(userId: UserId, threadId: ThreadId, kind: AiTaskKind): Promise<AiResult | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(aiResults)
        .where(
          and(
            eq(aiResults.userId, userId),
            eq(aiResults.threadId, threadId),
            eq(aiResults.kind, kind),
          ),
        )
        .orderBy(desc(aiResults.createdTs), desc(aiResults.id))
        .get();
      return row === undefined ? null : toAiResult(row);
    });
  }

  save(result: AiResult): Promise<AiResult> {
    return this.executor.execute((db) => {
      const row = toAiResultRow(result);
      const { id: _id, ...changes } = row;
      db.insert(aiResults)
        .values(row)
        .onConflictDoUpdate({ target: aiResults.id, set: changes })
        .run();
      return result;
    });
  }

  updateChecklistItem(
    userId: UserId,
    resultId: AiResultId,
    change: ChecklistItemChange,
  ): Promise<AiResult | null> {
    return this.executor.execute((db) => {
      const owned = and(eq(aiResults.userId, userId), eq(aiResults.id, resultId));
      const current = db.select().from(aiResults).where(owned).get();
      const output =
        current === undefined ? null : applyChecklistChange(toAiResult(current).output, change);
      if (output === null) {
        return null;
      }
      const [row] = db.update(aiResults).set({ output }).where(owned).returning().all();
      return row === undefined ? null : toAiResult(row);
    });
  }

  deleteByThread(threadId: ThreadId): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(aiResults).where(eq(aiResults.threadId, threadId)).run();
    });
  }
}
