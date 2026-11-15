import type { BrowserWindow } from 'electron';

export interface ManagedWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  on(event: 'closed', listener: () => void): unknown;
}

export class MainWindowController<Window extends ManagedWindow = BrowserWindow> {
  private window: Window | null = null;
  private opening: Promise<Window> | null = null;

  constructor(private readonly create: () => Promise<Window>) {}

  async open(): Promise<Window> {
    if (this.window !== null && !this.window.isDestroyed()) {
      return this.window;
    }
    this.opening ??= this.create().then(
      (window) => {
        this.window = window;
        this.opening = null;
        window.on('closed', () => {
          this.window = null;
        });
        return window;
      },
      (error: unknown) => {
        this.opening = null;
        throw error;
      },
    );
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
