import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from 'playwright';
import { readQaEnv } from '../config/qa-env';
import { qaPaths } from '../config/qa-paths';
import { appEnvironment } from './app-environment';
import { captureAppLog } from './app-log';
import { electronBinary } from './electron-binary';
import { applyHostOverrides, type HostOverrides } from './host-override';
import { isolatedKeyring } from './isolated-keyring';
import type { QaApp } from './qa-app';
import { resizeWindow, type WindowSize } from './window-size';
import type { ElectronApplication, Page } from 'playwright';

export interface LaunchOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly profileDir?: string;
  readonly appDir?: string;
  readonly hostOverrides?: HostOverrides;
}

const prepareWindow = async (
  electron: ElectronApplication,
  overrides: HostOverrides | undefined,
  size: WindowSize,
): Promise<Page> => {
  if (overrides !== undefined) {
    await applyHostOverrides(electron, overrides);
  }
  const page = await electron.firstWindow();
  await resizeWindow(electron, page, size);
  return page;
};

const HEADLESS_ARGS: readonly string[] = ['--no-sandbox', '--password-store=gnome-libsecret'];

export const launchApp = async (options: LaunchOptions = {}): Promise<QaApp> => {
  const qaEnv = readQaEnv();
  const profileDir = options.profileDir ?? (await mkdtemp(join(tmpdir(), 'relay-qa-')));
  const home = join(profileDir, 'home');
  await mkdir(home, { recursive: true });
  const keyring = await isolatedKeyring();
  const appDir = options.appDir ?? qaPaths.desktopDir;
  const electron = await _electron.launch({
    executablePath: electronBinary(appDir),
    args: [...HEADLESS_ARGS, `--user-data-dir=${join(profileDir, 'user-data')}`, appDir],
    cwd: appDir,
    env: appEnvironment(home, { ...keyring, ...options.env }),
  });
  const logFile = join(profileDir, 'app.log');
  const closeLog = captureAppLog(electron, logFile, qaEnv.QA_VERBOSE);
  let ready = false;
  try {
    const page = await prepareWindow(electron, options.hostOverrides, {
      width: qaEnv.QA_WINDOW_WIDTH,
      height: qaEnv.QA_WINDOW_HEIGHT,
    });
    ready = true;
    return {
      electron,
      page,
      profileDir,
      logFile,
      close: async () => {
        await electron.close();
        await closeLog();
        if (qaEnv.QA_KEEP_PROFILE || options.profileDir !== undefined) {
          return;
        }
        await rm(profileDir, { recursive: true, force: true });
      },
    };
  } finally {
    if (!ready) {
      await electron.close();
      await closeLog();
    }
  }
};
