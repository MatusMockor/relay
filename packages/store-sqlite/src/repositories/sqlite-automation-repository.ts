import type { AutomationRepository, PresetAutomation } from '@relay/engine';
import type { Automation, AutomationPreset, UserId } from '@relay/shared/domain';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toAutomation, toAutomationRow } from '../mappers/automation-mapper';
import { automations, removedAutomationPresets } from '../schema';

const removedPresetOf = (userId: UserId, preset: AutomationPreset) =>
  and(eq(removedAutomationPresets.userId, userId), eq(removedAutomationPresets.preset, preset));

export class SqliteAutomationRepository implements AutomationRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByUser(userId: UserId): Promise<Automation[]> {
    return this.executor.execute((db) => this.listOwned(db, userId));
  }

  replaceAll(userId: UserId, items: readonly Automation[]): Promise<Automation[]> {
    return this.executor.execute((db) => {
      db.delete(automations)
        .where(
          and(
            eq(automations.userId, userId),
            notInArray(
              automations.id,
              items.map((automation) => automation.id),
            ),
          ),
        )
        .run();
      items.forEach((automation) => {
        const row = toAutomationRow({ ...automation, userId });
        const { id: _id, userId: _owner, ...changes } = row;
        db.insert(automations)
          .values(row)
          .onConflictDoUpdate({
            target: automations.id,
            set: changes,
            setWhere: eq(automations.userId, userId),
          })
          .run();
      });
      return this.listOwned(db, userId);
    });
  }

  createPresetIfAbsent(automation: Automation): Promise<void> {
    return this.executor.execute((db) => {
      db.insert(automations).values(toAutomationRow(automation)).onConflictDoNothing().run();
    });
  }

  isPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db.select().from(removedAutomationPresets).where(removedPresetOf(userId, preset)).get() !==
        undefined,
    );
  }

  markPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<void> {
    return this.executor.execute((db) => {
      db.insert(removedAutomationPresets).values({ userId, preset }).onConflictDoNothing().run();
    });
  }

  restorePreset(automation: PresetAutomation): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(removedAutomationPresets)
        .where(removedPresetOf(automation.userId, automation.preset))
        .run();
      db.insert(automations).values(toAutomationRow(automation)).onConflictDoNothing().run();
    });
  }

  private listOwned(db: RelayDb, userId: UserId): Automation[] {
    return db
      .select()
      .from(automations)
      .where(eq(automations.userId, userId))
      .orderBy(asc(automations.position), asc(automations.id))
      .all()
      .map(toAutomation);
  }
}
