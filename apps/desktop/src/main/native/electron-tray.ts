import { app, Menu, type MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import trayIcon from '../../../resources/tray.png?asset';
import trayTemplateIcon from '../../../resources/trayTemplate.png?asset';

export interface TrayViewOptions {
  readonly showWindow: () => void;
  readonly template: () => MenuItemConstructorOptions[];
}

const tooltip = (count: number): string => {
  if (count === 0) {
    return 'Relay';
  }
  return `Relay - neprečítané: ${String(count)}`;
};

export class ElectronTrayView {
  private readonly tray: Tray;

  constructor(
    private readonly platform: NodeJS.Platform,
    private readonly options: TrayViewOptions,
  ) {
    const image = nativeImage.createFromPath(platform === 'darwin' ? trayTemplateIcon : trayIcon);
    image.setTemplateImage(platform === 'darwin');
    this.tray = new Tray(image);
    this.tray.setToolTip(tooltip(0));
    if (platform === 'darwin') {
      this.tray.on('click', () => {
        this.popUp();
      });
      this.tray.on('right-click', () => {
        this.popUp();
      });
      return;
    }
    this.refreshMenu();
    this.tray.on('click', options.showWindow);
  }

  refreshMenu(): void {
    if (this.platform === 'darwin' || this.tray.isDestroyed()) {
      return;
    }
    this.tray.setContextMenu(Menu.buildFromTemplate(this.options.template()));
  }

  setUnread(count: number): void {
    this.tray.setToolTip(tooltip(count));
    if (this.platform === 'darwin') {
      this.tray.setTitle(count > 0 ? String(count) : '');
    }
    app.setBadgeCount(count);
  }

  destroy(): void {
    this.tray.destroy();
  }

  private popUp(): void {
    this.tray.popUpContextMenu(Menu.buildFromTemplate(this.options.template()));
  }
}
