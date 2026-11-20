import type { Clock, OfflineWindowPolicy } from '@relay/engine';
import { type DeviceSettings, offlineWindowCutoff } from '@relay/shared/domain';

export interface DeviceSettingsReader {
  get(): Promise<DeviceSettings>;
}

export class DeviceOfflineWindow implements OfflineWindowPolicy {
  constructor(
    private readonly settings: DeviceSettingsReader,
    private readonly clock: Clock,
  ) {}

  async cutoff(): Promise<Date | null> {
    const { offlineWindow } = await this.settings.get();
    return offlineWindowCutoff(offlineWindow, this.clock.now());
  }
}
