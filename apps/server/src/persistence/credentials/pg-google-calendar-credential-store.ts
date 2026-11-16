import type { CalendarConnectionId } from '@relay/shared/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { googleCalendarConnections as connections } from '../schema';

export class PgGoogleCalendarCredentialStore {
  constructor(private readonly db: DbExecutor) {}

  async find(connectionId: CalendarConnectionId): Promise<string | null> {
    const [row] = await this.db
      .select({ envelope: connections.credentialsEnvelope })
      .from(connections)
      .where(eq(connections.id, connectionId));
    return row?.envelope ?? null;
  }

  async save(connectionId: CalendarConnectionId, envelope: string | null): Promise<boolean> {
    const rows = await this.db
      .update(connections)
      .set({ credentialsEnvelope: envelope })
      .where(eq(connections.id, connectionId))
      .returning({ id: connections.id });
    return rows.length > 0;
  }

  async replace(
    connectionId: CalendarConnectionId,
    expected: string,
    next: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(connections)
      .set({ credentialsEnvelope: next })
      .where(and(eq(connections.id, connectionId), eq(connections.credentialsEnvelope, expected)))
      .returning({ id: connections.id });
    return rows.length === 1;
  }
}
