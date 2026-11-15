import type { BrowserWindow } from 'electron';

export class MainWindowController {
  private window: BrowserWindow | null = null;
  private opening: Promise<BrowserWindow> | null = null;

  constructor(private readonly create: () => Promise<BrowserWindow>) {}

  async open(): Promise<BrowserWindow> {
    if (this.window !== null && !this.window.isDestroyed()) {
      return this.window;
    }
    this.opening ??= this.create().then((window) => {
      this.window = window;
      this.opening = null;
      window.on('closed', () => {
        this.window = null;
      });
      return window;
    });
    return this.opening;
  }

  async focus(): Promise<void> {
    const window = await this.open();
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  }
}
