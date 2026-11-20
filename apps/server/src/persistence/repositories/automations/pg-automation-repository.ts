import {
  type AutomationRepository,
  ConflictError,
  ForbiddenError,
  type PresetAutomation,
} from '@relay/engine';
import type { Automation, AutomationPreset, UserId } from '@relay/shared/domain';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { automations, removedAutomationPresets } from '../../schema';
import { assertOwned, lockUser } from '../../support/ownership';
import { toAutomation, toAutomationInsert } from './automation.mapper';

const removedPresetOf = (userId: UserId, preset: AutomationPreset) =>
  and(eq(removedAutomationPresets.userId, userId), eq(removedAutomationPresets.preset, preset));

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
              match: sql`excluded.match`,
              conditions: sql`excluded.conditions`,
              exceptions: sql`excluded.exceptions`,
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

  async isPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<boolean> {
    const rows = await this.db
      .select({ userId: removedAutomationPresets.userId })
      .from(removedAutomationPresets)
      .where(removedPresetOf(userId, preset));
    return rows.length > 0;
  }

  async markPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<void> {
    await this.db.insert(removedAutomationPresets).values({ userId, preset }).onConflictDoNothing();
  }

  async restorePreset(automation: PresetAutomation): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(removedAutomationPresets)
        .where(removedPresetOf(automation.userId, automation.preset));
      await tx.insert(automations).values(toAutomationInsert(automation)).onConflictDoNothing();
    });
  }
}
