import type { DevicePlatform } from '@relay/shared/domain';
import type { AppInfo } from '@relay/shared/ipc';

export interface AppMetadata {
  readonly name: string;
  readonly version: string;
  readonly isPackaged: boolean;
  readonly platform: string;
  readonly electronVersion: string;
}

const toDevicePlatform = (platform: string): DevicePlatform => {
  if (platform === 'darwin') {
    return 'macos';
  }
  if (platform === 'win32') {
    return 'windows';
  }
  return 'linux';
};

export const createAppInfoHandler = (metadata: AppMetadata) => (): AppInfo => ({
  name: metadata.name,
  version: metadata.version,
  platform: toDevicePlatform(metadata.platform),
  electronVersion: metadata.electronVersion,
  isPackaged: metadata.isPackaged,
});
