import type { ElectronApplication, Page } from 'playwright';

export interface QaApp {
  readonly electron: ElectronApplication;
  readonly page: Page;
  readonly profileDir: string;
  readonly logFile: string;
  close(): Promise<void>;
}
