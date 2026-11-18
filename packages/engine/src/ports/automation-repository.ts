import type { Automation, AutomationPreset, UserId } from '@relay/shared/domain';

export type PresetAutomation = Automation & { readonly preset: AutomationPreset };

export interface AutomationRepository {
  listByUser(userId: UserId): Promise<Automation[]>;
  replaceAll(userId: UserId, automations: readonly Automation[]): Promise<Automation[]>;
  createPresetIfAbsent(automation: Automation): Promise<void>;
  isPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<boolean>;
  markPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<void>;
  restorePreset(automation: PresetAutomation): Promise<void>;
}
