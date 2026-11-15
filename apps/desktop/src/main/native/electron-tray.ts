import { app, Menu, nativeImage, Tray } from 'electron';
import trayIcon from '../../../resources/tray.png?asset';
import trayTemplateIcon from '../../../resources/trayTemplate.png?asset';
import type { UnreadView } from './unread-badge-updater';

export interface TrayActions {
  readonly showWindow: () => void;
  readonly syncNow: () => void;
  readonly quit: () => void;
}

const tooltip = (count: number): string => {
  if (count === 0) {
    return 'Relay';
  }
  return `Relay - neprečítané: ${String(count)}`;
};

export class ElectronTrayView implements UnreadView {
  private readonly tray: Tray;

  constructor(
    private readonly platform: NodeJS.Platform,
    actions: TrayActions,
  ) {
    const image = nativeImage.createFromPath(platform === 'darwin' ? trayTemplateIcon : trayIcon);
    image.setTemplateImage(platform === 'darwin');
    this.tray = new Tray(image);
    this.tray.setToolTip(tooltip(0));
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Otvoriť Relay', click: actions.showWindow },
        { label: 'Synchronizovať teraz', click: actions.syncNow },
        { type: 'separator' },
        { label: 'Ukončiť', click: actions.quit },
      ]),
    );
    this.tray.on('click', actions.showWindow);
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
}
