import { Menu } from 'electron';
import { type AppMenuOptions, buildAppMenuTemplate } from './app-menu-template';

export const installAppMenu = (options: AppMenuOptions): void => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate(options)));
};
