import type { BrowserWindow } from 'electron';
import type { ElectronApplication, JSHandle, Page } from 'playwright';

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

export const resizeWindow = async (
  electron: ElectronApplication,
  page: Page,
  size: WindowSize,
): Promise<void> => {
  const handle = (await electron.browserWindow(page)) as JSHandle<BrowserWindow>;
  await handle.evaluate((browserWindow, bounds) => {
    browserWindow.setBounds({ x: 0, y: 0, ...bounds });
  }, size);
  await page.waitForFunction((expected) => Math.abs(window.innerWidth - expected) <= 2, size.width);
};
