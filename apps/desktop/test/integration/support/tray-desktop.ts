import type { MenuCommand } from '@relay/shared';
import { screen } from '@testing-library/react';
import { composeIpc } from '../../../src/main/composition/compose-ipc';
import { MenuCommandRequests } from '../../../src/main/native/menu-command-requests';
import { RendererView } from '../../../src/main/native/renderer-view';
import { createRelayBridge } from '../../../src/preload/create-bridge';
import { createBrowserPlatform } from '../../../src/renderer/src/platform/BrowserPlatform';
import { createElectronPlatform } from '../../../src/renderer/src/platform/ElectronPlatform';
import type { Platform } from '../../../src/renderer/src/platform/Platform';
import { renderApp, storageWith } from '../../../src/renderer/test/support/render-app';
import { InMemoryIpc } from '../../main/in-memory-ipc';

const appMetadata = {
  name: 'Relay',
  version: '0.1.5',
  isPackaged: true,
  platform: 'darwin',
  electronVersion: '45.3.2',
};

let streams = 0;

export const startTrayDesktop = () => {
  const menuCommands = new MenuCommandRequests();
  const view = new RendererView();
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: appMetadata, menuCommands, rendererView: view })),
    () => {
      streams += 1;
      return `tray-${String(streams)}`;
    },
  );
  const desktop = createElectronPlatform(bridge);
  const delivered: MenuCommand[] = [];
  const platform: Platform = {
    ...createBrowserPlatform(storageWith({ mode: 'local' })),
    subscribeToMenuCommands: (listener) =>
      desktop.subscribeToMenuCommands((command) => {
        listener(command);
        delivered.push(command);
      }),
    reportTray: (report) => {
      desktop.reportTray(report);
    },
  };
  return { menuCommands, view, delivered, platform };
};

export type TrayDesktop = ReturnType<typeof startTrayDesktop>;

export const renderTrayDesktop = async (desktop: TrayDesktop): Promise<TrayDesktop> => {
  renderApp({ platform: desktop.platform });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return desktop;
};

export const composeSender = async (): Promise<string> => {
  const button = await screen.findByRole('button', { name: /^Od: / });
  return button.getAttribute('aria-label') ?? '';
};
