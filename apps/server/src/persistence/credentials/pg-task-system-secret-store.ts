import type { TaskSystemConnectionId, UserId } from '@relay/shared/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { taskSystemConnections as connections } from '../schema';

const owned = (userId: UserId, connectionId: TaskSystemConnectionId) =>
  and(eq(connections.userId, userId), eq(connections.id, connectionId));

export class PgTaskSystemSecretStore {
  constructor(private readonly db: DbExecutor) {}

  async find(userId: UserId, connectionId: TaskSystemConnectionId): Promise<string | null> {
    const [row] = await this.db
      .select({ envelope: connections.credentialsEnvelope })
      .from(connections)
      .where(owned(userId, connectionId));
    return row?.envelope ?? null;
  }

  async save(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
    envelope: string | null,
  ): Promise<boolean> {
    const rows = await this.db
      .update(connections)
      .set({ credentialsEnvelope: envelope })
      .where(owned(userId, connectionId))
      .returning({ id: connections.id });
    return rows.length > 0;
  }
}
