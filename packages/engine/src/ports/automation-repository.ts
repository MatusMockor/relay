import type {
  Automation,
  AutomationId,
  AutomationPreset,
  UnsupportedAutomation,
  UserId,
} from '@relay/shared/domain';

export interface KeptAutomation {
  readonly id: AutomationId;
  readonly order: number;
}

export type PresetAutomation = Automation & { readonly preset: AutomationPreset };

export interface AutomationRepository {
  listByUser(userId: UserId): Promise<Automation[]>;
  listUnsupported(userId: UserId): Promise<UnsupportedAutomation[]>;
  replaceAll(
    userId: UserId,
    automations: readonly Automation[],
    keep?: readonly KeptAutomation[],
  ): Promise<Automation[]>;
  createPresetIfAbsent(automation: Automation): Promise<void>;
  isPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<boolean>;
  markPresetRemoved(userId: UserId, preset: AutomationPreset): Promise<void>;
  restorePreset(automation: PresetAutomation): Promise<void>;
}
