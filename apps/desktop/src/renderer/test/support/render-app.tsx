import { DEFAULT_DEVICE_SETTINGS, type DeviceSettings } from '@relay/shared';
import { resetLayers } from '@relay/ui';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { App } from '../../src/App';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { MailClient } from '../../src/data/MailClient';
import {
  createBrowserPlatform,
  DEVICE_SETTINGS_KEY,
  type KeyValueStorage,
} from '../../src/platform/BrowserPlatform';
import type { Platform } from '../../src/platform/Platform';
import { useChat } from '../../src/features/side/chat-store';
import { INITIAL_SESSION, useSessionStore } from '../../src/session/session-store';
import { SessionController } from '../../src/session/SessionController';
import { resetToasts } from '../../src/state/toast-store';
import { INITIAL_UI, useUiStore } from '../../src/state/ui-store';

export const memoryStorage = (
  initial: Record<string, string> = {},
): KeyValueStorage & { readonly data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
};

export const storageWith = (settings: Partial<DeviceSettings>) =>
  memoryStorage({
    [DEVICE_SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_DEVICE_SETTINGS, ...settings }),
  });

export const resetStores = (): void => {
  cleanup();
  resetLayers();
  useSessionStore.setState(INITIAL_SESSION);
  useUiStore.setState(INITIAL_UI);
  useChat.setState({ turns: [], queued: null });
  resetToasts();
};

export const testQueryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

export interface RenderedApp {
  readonly platform: Platform;
  readonly session: SessionController;
}

export const renderApp = (
  options: {
    readonly storage?: KeyValueStorage;
    readonly demo?: () => MailClient;
    readonly platform?: Platform;
    readonly queryClient?: QueryClient;
  } = {},
): RenderedApp => {
  const platform =
    options.platform ?? createBrowserPlatform(options.storage ?? storageWith({ mode: 'local' }));
  const session = new SessionController(platform, useSessionStore, {
    demo: options.demo ?? (() => createDemoMailClient({ aiStepMs: 0 })),
  });
  render(
    <App
      platform={platform}
      session={session}
      undoSendMs={40}
      createQueryClient={() => options.queryClient ?? testQueryClient()}
    />,
  );
  return { platform, session };
};
