import { writeFile } from 'node:fs/promises';
import type { DeviceSettingsPatch } from '@relay/shared/domain';
import { createElectronPlatform } from '../../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../../src/renderer/src/platform/Platform';
import {
  type LocalRuntimeHarness,
  type LocalRuntimeHarnessOptions,
  startLocalRuntime,
} from '../../main/support/local-runtime-harness';
import { startStubGoogleTokenEndpoint, type StubGoogle } from '../../main/support/stub-google';
import { createTempDir, type TempDir } from '../../main/support/temp-dir';

export interface DesktopFixture {
  readonly dir: TempDir;
  readonly google: StubGoogle;
  readonly harness: LocalRuntimeHarness;
  readonly platform: Platform;
  close(): Promise<void>;
}

export interface DesktopFixtureOptions extends LocalRuntimeHarnessOptions {
  readonly googleConfigured?: boolean;
  readonly device?: DeviceSettingsPatch;
}

export const GOOGLE_CLIENT_ID = 'desktop-client.apps.googleusercontent.com';

export const startDesktop = async (
  options: DesktopFixtureOptions = {},
): Promise<DesktopFixture> => {
  const dir = await createTempDir();
  const google = await startStubGoogleTokenEndpoint('jana@gmail.com');
  if (options.googleConfigured !== false) {
    await writeFile(
      dir.file('google-oauth.json'),
      JSON.stringify({ clientId: GOOGLE_CLIENT_ID, tokenEndpoint: google.tokenEndpoint }),
    );
  }
  const harness = startLocalRuntime(dir, options);
  await harness.bridge.invoke('settings.device.set', options.device ?? { mode: 'local' });
  return {
    dir,
    google,
    harness,
    platform: createElectronPlatform(harness.bridge),
    close: async () => {
      await harness.close();
      await google.close();
      await dir.remove();
    },
  };
};
