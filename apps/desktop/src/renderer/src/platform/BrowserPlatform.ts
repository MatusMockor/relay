import type {
  AppInfo,
  ContextMenuRequest,
  DeviceSettings,
  DeviceSettingsPatch,
  UpdateStatus,
} from '@relay/shared';
import { MailClientError } from '../data/errors';
import { RendererTokenSession } from '../data/remote/RendererTokenSession';
import { canonicalServerUrl, MemoryTokenStore, type TokenStore } from '../data/remote/TokenStore';
import { mergeDeviceSettings, parseStoredDeviceSettings } from './device-settings';
import type { Platform } from './Platform';
import { showBrowserNotification } from './browser-notification';
import { saveBlobAs } from './save-file';

export const DEVICE_SETTINGS_KEY = 'relay.device-settings';

const BROWSER_UPDATE_STATUS: UpdateStatus = { kind: 'disabled', reason: 'unsupported-platform' };

const googleUnavailable = () =>
  Promise.reject(
    new MailClientError({
      code: 'not_implemented',
      message: 'Prihlásenie cez Google funguje len v desktopovej aplikácii Relay.',
    }),
  );

const detectPlatform = (agent: string): AppInfo['platform'] => {
  if (/Mac|iPhone|iPad/i.test(agent)) {
    return 'macos';
  }
  return /Win/i.test(agent) ? 'windows' : 'linux';
};

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const readStored = (storage: KeyValueStorage | null): string | null => {
  try {
    return storage?.getItem(DEVICE_SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
};

const safeStorage = (): KeyValueStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export type ContextMenuOpener = (request: ContextMenuRequest) => Promise<string | null>;

const dismissContextMenu: ContextMenuOpener = () => Promise.resolve(null);

export interface BrowserPlatform extends Platform {
  tokenStore(serverUrl: string): TokenStore;
}

export const createBrowserPlatform = (
  storage: KeyValueStorage | null = safeStorage(),
  showContextMenu: ContextMenuOpener = dismissContextMenu,
): BrowserPlatform => {
  const tokens = new Map<string, TokenStore>();
  const tokenStore = (serverUrl: string): TokenStore => {
    const key = canonicalServerUrl(serverUrl);
    const existing = tokens.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = new MemoryTokenStore();
    tokens.set(key, created);
    return created;
  };
  let settings: DeviceSettings = parseStoredDeviceSettings(readStored(storage));
  return {
    kind: 'browser',
    bridge: null,
    appInfo: () =>
      Promise.resolve({
        name: 'Relay',
        version: 'web',
        platform: detectPlatform(navigator.userAgent),
        electronVersion: 'web',
        isPackaged: false,
      }),
    deviceSettings: () => Promise.resolve(settings),
    updateDeviceSettings: (patch: DeviceSettingsPatch) => {
      settings = mergeDeviceSettings(settings, patch);
      try {
        storage?.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        return Promise.resolve(settings);
      }
      return Promise.resolve(settings);
    },
    tokenStore,
    serverSession: (serverUrl, hooks) =>
      new RendererTokenSession({ ...hooks, baseUrl: serverUrl, tokens: tokenStore(serverUrl) }),
    detectLocalRunners: () => Promise.resolve([]),
    openExternal: (url) => {
      window.open(url, '_blank', 'noopener');
    },
    saveFile: saveBlobAs,
    authorizeGoogle: googleUnavailable,
    authorizeGoogleCalendar: googleUnavailable,
    cancelGoogleAuthorization: () => Promise.resolve(),
    subscribeToUpdates: (listener) => {
      listener(BROWSER_UPDATE_STATUS);
      return () => undefined;
    },
    checkForUpdates: () => Promise.resolve(),
    installUpdate: () => Promise.resolve(),
    subscribeToThreadOpens: () => () => undefined,
    subscribeToMenuCommands: () => () => undefined,
    reportTray: () => undefined,
    showNotification: showBrowserNotification,
    subscribeToFullScreen: () => () => undefined,
    showContextMenu,
  };
};
