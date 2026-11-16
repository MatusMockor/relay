import { api, type TokenPair } from '@relay/shared/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionSecretKey } from '../../src/main/ai/remote/server-session-key';
import { ServerSessions } from '../../src/main/ai/remote/server-sessions';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { systemClock } from '../../src/main/infra/system-clock';
import { EncryptedFileSecretStore } from '../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../src/main/secure/namespaced-secret-store';
import type { SecretStore } from '../../src/main/secure/secret-store';
import { createRelayBridge } from '../../src/preload/create-bridge';
import { createElectronPlatform } from '../../src/renderer/src/platform/ElectronPlatform';
import { createServerApi } from '../../src/renderer/src/session/services';
import { InMemoryIpc } from '../main/in-memory-ipc';
import { AesTestCipher } from '../main/support/aes-test-cipher';
import { startStubRelayServer, type StubRelayServer } from '../main/support/stub-relay-server';
import { createTempDir, type TempDir } from '../main/support/temp-dir';

const APP = {
  name: 'Relay',
  version: '0.0.0-test',
  isPackaged: false,
  platform: 'linux',
  electronVersion: 'test',
};

describe('renderer session in Electron goes through the main process', () => {
  let dir: TempDir;
  let server: StubRelayServer;
  let secrets: SecretStore;
  let sessions: ServerSessions;
  let expired: number;
  let streamId = 0;

  beforeEach(async () => {
    dir = await createTempDir();
    server = await startStubRelayServer();
    server.location = 'server';
    secrets = new NamespacedSecretStore(
      new EncryptedFileSecretStore(dir.file('secrets.bin'), new AesTestCipher()),
      'renderer',
    );
    sessions = new ServerSessions({ secrets, clock: systemClock });
    expired = 0;
  });

  afterEach(async () => {
    await server.close();
    await dir.remove();
  });

  const renderer = () => {
    const bridge = createRelayBridge(new InMemoryIpc(composeIpc({ app: APP, sessions })), () => {
      streamId += 1;
      return `stream-${String(streamId)}`;
    });
    return createServerApi(createElectronPlatform(bridge), server.url, {
      onSessionExpired: () => {
        expired += 1;
      },
    });
  };

  const store = async (tokens: TokenPair): Promise<void> => {
    await secrets.set(sessionSecretKey(server.url), JSON.stringify(tokens));
  };

  const refreshCalls = (): number =>
    server.calls.filter((call) => call === 'POST /auth/refresh').length;

  const claim = (http: ReturnType<typeof renderer>['http']) =>
    http.call(api.ai.claimJobs, { body: { limit: 1 } });

  it('shares one refresh between renderer requests and the remote AI worker', async () => {
    await store(server.issueTokens(31_000));
    const { http } = renderer();

    const [first, workerToken, second] = await Promise.all([
      claim(http),
      sessions.get(server.url).accessToken(),
      claim(http),
    ]);

    expect(refreshCalls()).toBe(1);
    expect(first).toEqual({ location: 'server', jobs: [] });
    expect(second).toEqual({ location: 'server', jobs: [] });
    expect(workerToken).toBe(server.tokens.accessToken);
    expect(expired).toBe(0);
  });
});
