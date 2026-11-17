import type { Automation, UserId } from '@relay/shared/domain';

export interface AutomationRepository {
  listByUser(userId: UserId): Promise<Automation[]>;
  replaceAll(userId: UserId, automations: readonly Automation[]): Promise<Automation[]>;
  createPresetIfAbsent(automation: Automation): Promise<void>;
}
