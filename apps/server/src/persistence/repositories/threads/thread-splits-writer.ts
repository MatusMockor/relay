import type { SplitId, ThreadId, UserId } from '@relay/shared/domain';
import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { splits, threadSplits } from '../../schema';

export const replaceThreadSplits = async (
  db: DbExecutor,
  userId: UserId,
  threadId: ThreadId,
  splitIds: readonly SplitId[],
): Promise<void> => {
  await db.delete(threadSplits).where(eq(threadSplits.threadId, threadId));
  if (splitIds.length === 0) {
    return;
  }
  await db.execute(sql`
    insert into ${threadSplits} (thread_id, split_id, user_id)
    select ${threadId}, ${splits.id}, ${splits.userId}
    from ${splits}
    where ${splits.userId} = ${userId} and ${splits.id} in ${[...splitIds]}
    on conflict do nothing
  `);
};
