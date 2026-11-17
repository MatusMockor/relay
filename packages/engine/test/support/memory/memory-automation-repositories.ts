import type { Automation, UserId } from '@relay/shared/domain';
import type { AutomationRepository, AutomationRun, AutomationRunRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryAutomationRepository implements AutomationRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<Automation[]> {
    const automations = this.db.tables.automations.get(userId) ?? [];
    return Promise.resolve(
      [...automations].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    );
  }

  replaceAll(userId: UserId, automations: readonly Automation[]): Promise<Automation[]> {
    this.db.tables.automations.set(userId, [...automations]);
    return this.listByUser(userId);
  }

  createPresetIfAbsent(automation: Automation): Promise<void> {
    const current = this.db.tables.automations.get(automation.userId) ?? [];
    if (current.some((item) => item.preset === automation.preset)) {
      return Promise.resolve();
    }
    this.db.tables.automations.set(automation.userId, [...current, automation]);
    return Promise.resolve();
  }
}

export class MemoryAutomationRunRepository implements AutomationRunRepository {
  constructor(private readonly db: MemoryDatabase) {}

  claim(run: AutomationRun): Promise<boolean> {
    const key = `${run.automationId}:${run.messageId}`;
    if (this.db.tables.automationRuns.has(key)) {
      return Promise.resolve(false);
    }
    this.db.tables.automationRuns.add(key);
    return Promise.resolve(true);
  }
}
