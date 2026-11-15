import type { MailClient } from '../data/MailClient';
import { createDemoMailClient } from '../data/demo/DemoMailClient';
import { createLocalMailClient } from '../data/local/LocalMailClient';
import { HttpApi, type FetchLike } from '../data/remote/HttpApi';
import type { RealtimeStatus, SocketLike } from '../data/remote/RealtimeConnection';
import { createRemoteMailClient } from '../data/remote/RemoteMailClient';
import { ServerApi } from '../data/remote/ServerApi';
import type { Platform } from '../platform/Platform';

export type SessionMode = 'demo' | 'local' | 'synced';

export interface AppServices {
  readonly mode: SessionMode;
  readonly client: MailClient;
  readonly server: ServerApi | null;
  readonly serverUrl: string | null;
}

export interface ServiceHooks {
  readonly onRealtimeStatus: (status: RealtimeStatus) => void;
  readonly fetch?: FetchLike;
  readonly createSocket?: (url: string) => SocketLike;
  readonly demo?: () => MailClient;
}

export const createServerApi = (
  platform: Platform,
  serverUrl: string,
  hooks: { readonly fetch?: FetchLike; readonly onSessionExpired: () => void },
) => {
  const session = platform.serverSession(serverUrl, {
    fetch: hooks.fetch,
    onSessionExpired: hooks.onSessionExpired,
  });
  const http = new HttpApi({ baseUrl: serverUrl, session, fetch: hooks.fetch });
  return { http, server: new ServerApi(http, session) };
};

export type ServerApiBundle = ReturnType<typeof createServerApi>;

export const createSyncedServices = (
  serverUrl: string,
  { http, server }: ServerApiBundle,
  hooks: ServiceHooks,
): AppServices => {
  const client = createRemoteMailClient({
    http,
    createSocket: hooks.createSocket,
    onRealtimeStatus: hooks.onRealtimeStatus,
  });
  return { mode: 'synced', client, server, serverUrl };
};

export const createOfflineServices = (platform: Platform, hooks: ServiceHooks): AppServices => {
  if (platform.bridge !== null) {
    return {
      mode: 'local',
      client: createLocalMailClient(platform.bridge),
      server: null,
      serverUrl: null,
    };
  }
  return {
    mode: 'demo',
    client: (hooks.demo ?? createDemoMailClient)(),
    server: null,
    serverUrl: null,
  };
};
