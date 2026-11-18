import type { Logger } from '@relay/engine';
import { app, autoUpdater as nativeUpdater } from 'electron';
import { type AppUpdates, createAppUpdates } from '../composition/app-updates';
import { systemClock } from '../infra/system-clock';
import { systemTimers } from '../platform/timers';
import type { AppUpdater } from '../updates/app-updater';
import { ElectronUpdaterAdapter, type UpdaterLike } from '../updates/electron-updater-adapter';
import { DOWNLOAD_IS_READY, type InstallReadiness } from '../updates/install-readiness';
import {
  NATIVE_STAGING_TIMEOUT_MS,
  NativeStagingReadiness,
} from '../updates/native-staging-readiness';
import { readPackageType } from '../updates/package-type';
import { type RestartStrategy, UPDATER_RESTARTS } from '../updates/restart-strategy';
import { resolveUpdateAvailability } from '../updates/update-availability';

const restartStrategy = (appImage: string | undefined): RestartStrategy => {
  if (process.platform !== 'linux' || appImage === undefined) {
    return UPDATER_RESTARTS;
  }
  return {
    kind: 'relaunch-after-exit',
    executable: appImage,
    relaunch: (executable) => {
      app.relaunch({ execPath: executable, args: [] });
    },
  };
};

const installReadiness = (updater: UpdaterLike): InstallReadiness => {
  if (process.platform !== 'darwin') {
    return DOWNLOAD_IS_READY;
  }
  return new NativeStagingReadiness({
    native: nativeUpdater,
    updater,
    timers: systemTimers,
    timeoutMs: NATIVE_STAGING_TIMEOUT_MS,
  });
};

const loadElectronUpdater = async (logger: Logger): Promise<AppUpdater> => {
  const { autoUpdater } = await import('electron-updater');
  return new ElectronUpdaterAdapter(
    autoUpdater,
    logger,
    restartStrategy(process.env.APPIMAGE),
    installReadiness(autoUpdater),
  );
};

export const electronAppUpdates = (logger: Logger): AppUpdates => {
  const updateLogger = logger.child({ scope: 'updates' });
  return createAppUpdates({
    availability: resolveUpdateAvailability({
      platform: process.platform,
      isPackaged: app.isPackaged,
      appImage: process.env.APPIMAGE,
      packageType: app.isPackaged ? readPackageType(process.resourcesPath) : null,
    }),
    loadUpdater: () => loadElectronUpdater(updateLogger),
    timers: systemTimers,
    clock: systemClock,
    logger: updateLogger,
  });
};
