import type { ThreadFolderQuery } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import { desc } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import type { TimeIdPosition } from '../../pagination/time-id-cursor';
import { threads } from '../../schema';
import { threadFolderCondition } from './thread-folder-condition';

export const selectFolderThreads = (
  db: RelayDb,
  userId: UserId,
  query: ThreadFolderQuery,
  position: TimeIdPosition | null,
  limit: number,
) =>
  db
    .select()
    .from(threads)
    .where(threadFolderCondition(userId, query, position))
    .orderBy(desc(threads.lastMessageTs), desc(threads.id))
    .limit(limit);
