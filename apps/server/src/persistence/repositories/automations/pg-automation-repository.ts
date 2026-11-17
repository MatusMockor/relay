import { type AutomationRepository, ConflictError, ForbiddenError } from '@relay/engine';
import type { Automation, UserId } from '@relay/shared/domain';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { automations } from '../../schema';
import { assertOwned, lockUser } from '../../support/ownership';
import { toAutomation, toAutomationInsert } from './automation.mapper';

export class PgAutomationRepository implements AutomationRepository {
  constructor(private readonly db: DbExecutor) {}

  async listByUser(userId: UserId): Promise<Automation[]> {
    const rows = await this.db
      .select()
      .from(automations)
      .where(eq(automations.userId, userId))
      .orderBy(asc(automations.position), asc(automations.id));
    return rows.map(toAutomation);
  }

  async replaceAll(userId: UserId, items: readonly Automation[]): Promise<Automation[]> {
    if (items.some((automation) => automation.userId !== userId)) {
      throw new ForbiddenError('Automations must belong to the user');
    }
    return this.db.transaction(async (tx) => {
      await lockUser(tx, userId);
      for (const accountId of new Set(items.map((automation) => automation.accountId))) {
        await assertOwned(tx, 'Account', userId, accountId);
      }
      const keepIds = items.map((automation) => automation.id);
      await tx
        .delete(automations)
        .where(
          and(
            eq(automations.userId, userId),
            keepIds.length === 0 ? undefined : notInArray(automations.id, keepIds),
          ),
        );
      if (items.length > 0) {
        const written = await tx
          .insert(automations)
          .values(items.map(toAutomationInsert))
          .onConflictDoUpdate({
            target: automations.id,
            set: {
              accountId: sql`excluded.account_id`,
              name: sql`excluded.name`,
              enabled: sql`excluded.enabled`,
              position: sql`excluded.position`,
              preset: sql`excluded.preset`,
              conditions: sql`excluded.conditions`,
              ai: sql`excluded.ai`,
              actions: sql`excluded.actions`,
            },
            setWhere: eq(automations.userId, userId),
          })
          .returning({ id: automations.id });
        if (written.length < new Set(keepIds).size) {
          throw new ConflictError('An automation id is already in use');
        }
      }
      return new PgAutomationRepository(tx).listByUser(userId);
    });
  }

  async createPresetIfAbsent(automation: Automation): Promise<void> {
    await this.db.insert(automations).values(toAutomationInsert(automation)).onConflictDoNothing();
  }
}
