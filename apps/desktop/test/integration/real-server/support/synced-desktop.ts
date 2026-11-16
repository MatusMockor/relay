import { randomBytes } from 'node:crypto';
import { type AuthSession, type TokenPair, TokenPairSchema } from '@relay/shared/api';
import { sessionSecretKey } from '../../../../src/main/ai/remote/server-session-key';
import { ServerSessions } from '../../../../src/main/ai/remote/server-sessions';
import { composeIpc } from '../../../../src/main/composition/compose-ipc';
import { EncryptedFileSecretStore } from '../../../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../../../src/main/secure/namespaced-secret-store';
import type { SecretStore } from '../../../../src/main/secure/secret-store';
import { DeviceSettingsStore } from '../../../../src/main/settings/device-settings-store';
import { createRelayBridge } from '../../../../src/preload/create-bridge';
import type { MailClient } from '../../../../src/renderer/src/data/MailClient';
import type { RealtimeStatus } from '../../../../src/renderer/src/data/remote/RealtimeConnection';
import { createElectronPlatform } from '../../../../src/renderer/src/platform/ElectronPlatform';
import {
  createServerApi,
  createSyncedServices,
  type ServerApiBundle,
} from '../../../../src/renderer/src/session/services';
import { InMemoryIpc } from '../../../main/in-memory-ipc';
import { AesTestCipher } from '../../../main/support/aes-test-cipher';
import { createTempDir, type TempDir } from '../../../main/support/temp-dir';
import { ShiftedClock } from './shifted-clock';

export const TEST_PASSWORD = 'správne-heslo-123';

const APP = {
  name: 'Relay',
  version: '0.0.0-test',
  isPackaged: false,
  platform: 'linux',
  electronVersion: 'test',
};

export interface SyncedDesktop {
  readonly serverUrl: string;
  readonly dir: TempDir;
  readonly clock: ShiftedClock;
  readonly secrets: SecretStore;
  readonly sessions: ServerSessions;
  readonly deviceSettings: DeviceSettingsStore;
  readonly api: ServerApiBundle;
  readonly realtime: RealtimeStatus[];
  expiredSessions(): number;
  register(email: string): Promise<AuthSession>;
  login(email: string, deviceName?: string): Promise<AuthSession>;
  storedTokens(): Promise<TokenPair | null>;
  openClient(): MailClient;
  close(): Promise<void>;
}

export const uniqueEmail = (prefix: string): string =>
  `${prefix}-${randomBytes(5).toString('hex')}@relay.test`;

const parseTokens = (raw: string | null): TokenPair | null =>
  raw === null ? null : TokenPairSchema.parse(JSON.parse(raw));

export const startSyncedDesktop = async (serverUrl: string): Promise<SyncedDesktop> => {
  const dir = await createTempDir('relay-desktop-synced-');
  const clock = new ShiftedClock();
  const secrets = new NamespacedSecretStore(
    new EncryptedFileSecretStore(dir.file('secrets.bin'), new AesTestCipher()),
    'renderer',
  );
  const sessions = new ServerSessions({ secrets, clock });
  const deviceSettings = new DeviceSettingsStore(dir.file('device-settings.json'));
  await deviceSettings.update({ mode: 'synced', activeServerUrl: serverUrl });
  let streams = 0;
  const bridge = createRelayBridge(
    new InMemoryIpc(composeIpc({ app: APP, sessions, deviceSettings, secrets })),
    () => {
      streams += 1;
      return `stream-${String(streams)}`;
    },
  );
  let expired = 0;
  const api = createServerApi(createElectronPlatform(bridge), serverUrl, {
    onSessionExpired: () => {
      expired += 1;
    },
  });
  const realtime: RealtimeStatus[] = [];
  const clients: MailClient[] = [];
  return {
    serverUrl,
    dir,
    clock,
    secrets,
    sessions,
    deviceSettings,
    api,
    realtime,
    expiredSessions: () => expired,
    register: (email) =>
      api.server.register(
        { email, password: TEST_PASSWORD, displayName: 'Jana Testová' },
        { name: 'Relay test desktop', platform: 'linux' },
      ),
    login: (email, deviceName = 'Relay test desktop') =>
      api.server.login({ email, password: TEST_PASSWORD }, { name: deviceName, platform: 'linux' }),
    storedTokens: async () => parseTokens(await secrets.get(sessionSecretKey(serverUrl))),
    openClient: () => {
      const { client } = createSyncedServices(serverUrl, api, {
        onRealtimeStatus: (status) => {
          realtime.push(status);
        },
      });
      clients.push(client);
      return client;
    },
    close: async () => {
      clients.forEach((client) => {
        client.dispose();
      });
      await dir.remove();
    },
  };
};
