import { Injectable } from '@nestjs/common';
import type { DeviceId } from '@relay/shared/domain';

export type DeviceRevocationListener = (deviceId: DeviceId) => void;

@Injectable()
export class DeviceRevocations {
  private readonly listeners = new Set<DeviceRevocationListener>();

  subscribe(listener: DeviceRevocationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(deviceId: DeviceId): void {
    this.listeners.forEach((listener) => {
      listener(deviceId);
    });
  }
}
