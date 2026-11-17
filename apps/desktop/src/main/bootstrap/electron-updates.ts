import type { Logger } from '@relay/engine';
import { app } from 'electron';
import { type AppUpdates, createAppUpdates } from '../composition/app-updates';
import { systemTimers } from '../platform/timers';
import type { AppUpdater } from '../updates/app-updater';
import { ElectronUpdaterAdapter } from '../updates/electron-updater-adapter';
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

const loadElectronUpdater = async (logger: Logger): Promise<AppUpdater> => {
  const { autoUpdater } = await import('electron-updater');
  return new ElectronUpdaterAdapter(autoUpdater, logger, restartStrategy(process.env.APPIMAGE));
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
    logger: updateLogger,
  });
};
