import type { UserId, UserSettings } from '@relay/shared/domain';

export interface SettingsRepository {
  find(userId: UserId): Promise<UserSettings | null>;
  save(userId: UserId, settings: UserSettings): Promise<UserSettings>;
  saveIfUnchanged(
    userId: UserId,
    expected: UserSettings | null,
    next: UserSettings,
  ): Promise<boolean>;
}
