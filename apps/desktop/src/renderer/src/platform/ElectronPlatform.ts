import {
  DEFAULT_DEVICE_SETTINGS,
  type IpcResult,
  MenuCommandSchema,
  type RelayBridge,
  TrackpadScrollEventSchema,
} from '@relay/shared';
import { MailClientError } from '../data/errors';
import { MainProcessSession } from '../data/remote/MainProcessSession';
import type { Platform } from './Platform';
import { fitNotification } from './fit-notification';
import { saveBlobAs } from './save-file';
import { ThreadOpenFeed } from './thread-open-feed';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

export const createElectronPlatform = (bridge: RelayBridge): Platform => {
  const threadOpens = new ThreadOpenFeed(bridge);
  return {
    kind: 'electron',
    bridge,
    appInfo: () => unwrap(bridge.invoke('app.getInfo')),
    deviceSettings: () =>
      unwrap(bridge.invoke('settings.device.get')).catch(() => DEFAULT_DEVICE_SETTINGS),
    updateDeviceSettings: (patch) => unwrap(bridge.invoke('settings.device.set', patch)),
    serverSession: (serverUrl, hooks) => new MainProcessSession(bridge, serverUrl, hooks),
    detectLocalRunners: () => unwrap(bridge.invoke('ai.detectRunners')).catch(() => []),
    openExternal: (url) => {
      window.open(url, '_blank', 'noopener');
    },
    saveFile: saveBlobAs,
    authorizeGoogle: (input) => unwrap(bridge.invoke('oauth.google.authorize', input)),
    authorizeGoogleCalendar: (input) =>
      unwrap(bridge.invoke('oauth.google.authorizeCalendar', input)),
    cancelGoogleAuthorization: async () => {
      await unwrap(bridge.invoke('oauth.google.cancel'));
    },
    subscribeToUpdates: (listener) =>
      bridge.subscribe('app.update.events', { onEvent: listener, onError: () => undefined }),
    checkForUpdates: async () => {
      await unwrap(bridge.invoke('app.update.check'));
    },
    installUpdate: async () => {
      await unwrap(bridge.invoke('app.update.install'));
    },
    subscribeToThreadOpens: (listener) => threadOpens.subscribe(listener),
    subscribeToMenuCommands: (listener) =>
      bridge.subscribe('app.menu.command', {
        onEvent: (event) => {
          const parsed = MenuCommandSchema.safeParse(event);
          if (!parsed.success) {
            return;
          }
          listener(parsed.data);
        },
        onError: () => undefined,
      }),
    reportTray: (report) => {
      void bridge.invoke('app.tray.report', report);
    },
    showNotification: async (notification) => {
      await unwrap(bridge.invoke('app.notification.show', fitNotification(notification)));
    },
    subscribeToFullScreen: (listener) =>
      bridge.subscribe('app.window.fullScreen', {
        onEvent: (status) => {
          listener(status.fullScreen);
        },
        onError: () => undefined,
      }),
    subscribeToTrackpadScroll: (listener) =>
      bridge.subscribe('app.window.trackpadScroll', {
        onEvent: (event) => {
          const parsed = TrackpadScrollEventSchema.safeParse(event);
          if (!parsed.success) {
            return;
          }
          listener(parsed.data.phase);
        },
        onError: () => undefined,
      }),
    showContextMenu: (request) =>
      unwrap(bridge.invoke('app.contextMenu.show', request)).then(
        (result) => result.id,
        () => null,
      ),
  };
};

export const createPlatform = (bridge: RelayBridge | null, browser: () => Platform): Platform =>
  bridge === null ? browser() : createElectronPlatform(bridge);
