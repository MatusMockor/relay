import {
  type AiRunnerLocation,
  DEFAULT_USER_SETTINGS,
  type UserId,
  type UserSettings,
} from '@relay/shared/domain';
import type { SettingsRepository } from '../../ports/settings-repository';

export interface UserSettingsPolicy {
  readonly defaults: UserSettings;
  readonly pinnedAiLocation: AiRunnerLocation | null;
}

export const DEFAULT_USER_SETTINGS_POLICY: UserSettingsPolicy = {
  defaults: DEFAULT_USER_SETTINGS,
  pinnedAiLocation: null,
};

export class UserSettingsReader {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly policy: UserSettingsPolicy = DEFAULT_USER_SETTINGS_POLICY,
  ) {}

  async read(userId: UserId): Promise<UserSettings> {
    return this.effective((await this.settings.find(userId)) ?? this.policy.defaults);
  }

  effective(settings: UserSettings): UserSettings {
    const pinned = this.policy.pinnedAiLocation;
    if (pinned === null || settings.ai.location === pinned) {
      return settings;
    }
    return { ...settings, ai: { ...settings.ai, location: pinned } };
  }
}
