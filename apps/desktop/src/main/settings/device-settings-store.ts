import { ValidationError } from '@relay/engine';
import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceSettings,
  type DeviceSettingsPatch,
  DeviceSettingsSchema,
} from '@relay/shared/domain';
import { EventHub } from '../events/event-hub';
import { type JsonDocument, JsonFile } from '../storage/json-file';

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
  private readonly file: JsonDocument<DeviceSettings>;
  private cached: DeviceSettings | null = null;
  private loading: Promise<DeviceSettings> | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  private readonly changes = new EventHub<DeviceSettings>();

  constructor(source: string | JsonDocument<DeviceSettings>) {
    this.file = typeof source === 'string' ? new JsonFile(source, DeviceSettingsSchema) : source;
  }

  get(): Promise<DeviceSettings> {
    if (this.cached !== null) {
      return Promise.resolve(this.cached);
    }
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  onChange(listener: (settings: DeviceSettings) => void): () => void {
    return this.changes.subscribe(listener);
  }

  update(patch: DeviceSettingsPatch): Promise<DeviceSettings> {
    const next = this.pending.then(() => this.apply(patch));
    this.pending = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<DeviceSettings> {
    const loaded = (await this.file.read()) ?? DEFAULT_DEVICE_SETTINGS;
    this.cached ??= loaded;
    return this.cached;
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
