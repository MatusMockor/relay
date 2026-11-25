import {
  mergeUserSettings,
  type UserId,
  type UserSettings,
  type UserSettingsPatch,
} from '@relay/shared/domain';
import { ConflictError } from '../../errors';
import type { SettingsRepository } from '../../ports/settings-repository';
import type { QueuedAiJobRelocator } from '../ai/queued-ai-job-relocator';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import type { UserSettingsReader } from '../shared/user-settings-reader';

const MAX_SAVE_ATTEMPTS = 5;

export interface SettingsServiceDeps {
  readonly settings: SettingsRepository;
  readonly reader: UserSettingsReader;
  readonly relocator: QueuedAiJobRelocator;
  readonly events: EngineEvents;
}

export class SettingsService {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: SettingsServiceDeps) {}

  get(userId: UserId): Promise<UserSettings> {
    return this.deps.reader.read(userId);
  }

  update(userId: UserId, patch: UserSettingsPatch): Promise<UserSettings> {
    return this.serializer.run(userId, () => this.updateNow(userId, patch));
  }

  private async updateNow(userId: UserId, patch: UserSettingsPatch): Promise<UserSettings> {
    const saved = this.deps.reader.effective(await this.save(userId, patch));
    await this.deps.events.emit(userId, 'settings.updated', { settings: saved });
    await this.deps.relocator.relocate(userId, saved.ai.location);
    return saved;
  }

  private async save(userId: UserId, patch: UserSettingsPatch): Promise<UserSettings> {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
      const stored = await this.deps.settings.find(userId);
      const merged = mergeUserSettings(
        this.deps.reader.effective(stored ?? this.deps.reader.defaults),
        patch,
      );
      if (await this.deps.settings.saveIfUnchanged(userId, stored, merged)) {
        return merged;
      }
    }
    throw new ConflictError('Settings changed concurrently, try again');
  }
}
