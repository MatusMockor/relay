import { ValidationError } from '@relay/engine';
import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  type DeviceSettingsPatch,
  DeviceSettingsSchema,
} from '@relay/shared/domain';
import { EventHub } from '../events/event-hub';
import { JsonFile } from '../storage/json-file';

const applyPatch = (current: DeviceSettings, patch: DeviceSettingsPatch): DeviceSettings => ({
  savedServers: patch.savedServers ?? current.savedServers,
  activeServerUrl:
    patch.activeServerUrl === undefined ? current.activeServerUrl : patch.activeServerUrl,
  mode: patch.mode === undefined ? current.mode : patch.mode,
  panelWidths: { ...current.panelWidths, ...patch.panelWidths },
  selectedAccountId:
    patch.selectedAccountId === undefined ? current.selectedAccountId : patch.selectedAccountId,
});

export class DeviceSettingsStore {
  private readonly file: JsonFile<typeof DeviceSettingsSchema>;
  private cached: DeviceSettings | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  private readonly changes = new EventHub<DeviceSettings>();

  constructor(path: string) {
    this.file = new JsonFile(path, DeviceSettingsSchema);
  }

  async get(): Promise<DeviceSettings> {
    if (this.cached !== null) {
      return this.cached;
    }
    this.cached = (await this.file.read()) ?? DEFAULT_DEVICE_SETTINGS;
    return this.cached;
  }

  onChange(listener: (settings: DeviceSettings) => void): () => void {
    return this.changes.subscribe(listener);
  }

  update(patch: DeviceSettingsPatch): Promise<DeviceSettings> {
    const next = this.pending.then(() => this.apply(patch));
    this.pending = next.catch(() => undefined);
    return next;
  }

  private async apply(patch: DeviceSettingsPatch): Promise<DeviceSettings> {
    const parsed = DeviceSettingsSchema.safeParse(applyPatch(await this.get(), patch));
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    await this.file.write(parsed.data);
    this.cached = parsed.data;
    this.changes.publish(parsed.data);
    return parsed.data;
  }
}
