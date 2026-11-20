import type {
  Automation,
  AutomationId,
  AutomationPreset,
  MessageId,
  UnsupportedAutomation,
  UserId,
} from '@relay/shared/domain';
import type {
  AutomationRepository,
  AutomationRun,
  AutomationRunRepository,
  PresetAutomation,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryAutomationRepository implements AutomationRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<Automation[]> {
    const automations = this.db.tables.automations.get(userId) ?? [];
    return Promise.resolve(
      [...automations].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    );
  }

  listUnsupported(userId: UserId): Promise<UnsupportedAutomation[]> {
    return Promise.resolve([...(this.db.tables.unsupportedAutomations.get(userId) ?? [])]);
  }

  replaceAll(
    userId: UserId,
    automations: readonly Automation[],
    keep: readonly AutomationId[] = [],
  ): Promise<Automation[]> {
    this.db.tables.automations.set(userId, [...automations]);
    const unsupported = this.db.tables.unsupportedAutomations.get(userId) ?? [];
    this.db.tables.unsupportedAutomations.set(
      userId,
      unsupported.filter((entry) => keep.includes(entry.id)),
    );
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

  isPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<boolean> {
    return Promise.resolve(this.db.tables.removedPresets.has(`${userId}:${preset}`));
  }

  markPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<void> {
    this.db.tables.removedPresets.add(`${userId}:${preset}`);
    return Promise.resolve();
  }

  restorePreset(automation: PresetAutomation): Promise<void> {
    this.db.tables.removedPresets.delete(`${automation.userId}:${automation.preset}`);
    return this.createPresetIfAbsent(automation);
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

  release(automationId: AutomationId, messageIds: readonly MessageId[]): Promise<void> {
    messageIds.forEach((messageId) => {
      this.db.tables.automationRuns.delete(`${automationId}:${messageId}`);
    });
    return Promise.resolve();
  }
}
