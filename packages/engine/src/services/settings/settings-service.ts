import type { UserId, UserSettings, UserSettingsPatch } from '@relay/shared/domain';
import type { SettingsRepository } from '../../ports/settings-repository';
import type { QueuedAiJobRelocator } from '../ai/queued-ai-job-relocator';
import type { EngineEvents } from '../shared/engine-events';
import type { UserSettingsReader } from '../shared/user-settings-reader';

export const mergeUserSettings = (
  current: UserSettings,
  patch: UserSettingsPatch,
): UserSettings => ({
  notifications: patch.notifications ?? current.notifications,
  density: patch.density ?? current.density,
  ai: {
    location: patch.ai?.location ?? current.ai.location,
    defaultRunner: patch.ai?.defaultRunner ?? current.ai.defaultRunner,
    features: { ...current.ai.features, ...patch.ai?.features },
  },
});

export interface SettingsServiceDeps {
  readonly settings: SettingsRepository;
  readonly reader: UserSettingsReader;
  readonly relocator: QueuedAiJobRelocator;
  readonly events: EngineEvents;
}

export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  get(userId: UserId): Promise<UserSettings> {
    return this.deps.reader.read(userId);
  }

  async update(userId: UserId, patch: UserSettingsPatch): Promise<UserSettings> {
    const current = await this.get(userId);
    const merged = mergeUserSettings(current, patch);
    const saved = this.deps.reader.effective(await this.deps.settings.save(userId, merged));
    await this.deps.events.emit(userId, 'settings.updated', { settings: saved });
    if (saved.ai.location !== current.ai.location) {
      await this.deps.relocator.relocate(userId, saved.ai.location);
    }
    return saved;
  }
}
