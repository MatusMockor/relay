import type { TaskSystemConnectionId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { taskSystemConnections as connections } from '../schema';

export class PgTaskSystemSecretStore {
  constructor(private readonly db: DbExecutor) {}

  async find(connectionId: TaskSystemConnectionId): Promise<string | null> {
    const [row] = await this.db
      .select({ envelope: connections.credentialsEnvelope })
      .from(connections)
      .where(eq(connections.id, connectionId));
    return row?.envelope ?? null;
  }

  async save(connectionId: TaskSystemConnectionId, envelope: string | null): Promise<boolean> {
    const rows = await this.db
      .update(connections)
      .set({ credentialsEnvelope: envelope })
      .where(eq(connections.id, connectionId))
      .returning({ id: connections.id });
    return rows.length > 0;
  }
}
