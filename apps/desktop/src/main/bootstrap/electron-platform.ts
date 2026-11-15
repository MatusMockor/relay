import { app } from 'electron';
import { resolveLocalPaths, type LocalPaths } from '../composition/local-paths';
import { ElectronPowerEvents } from '../platform/electron-power-events';
import { ElectronSecretCipher } from '../platform/electron-secret-cipher';
import { ElectronUrlOpener } from '../platform/electron-url-opener';
import { resolveMigrationsFolder } from './resolve-migrations-folder';

export const electronLocalPaths = (): LocalPaths =>
  resolveLocalPaths(
    app.getPath('userData'),
    resolveMigrationsFolder({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    }),
  );

export const electronPlatform = () => ({
  cipher: new ElectronSecretCipher(process.platform),
  power: new ElectronPowerEvents(),
  opener: new ElectronUrlOpener(),
});
