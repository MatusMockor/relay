import type { TokenPair } from '@relay/shared/api';
import type { SessionAccess } from '@relay/shared/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../src/main/ai/remote/server-session';
import { sessionSecretKey } from '../../src/main/ai/remote/server-session-key';
import { ServerSessions } from '../../src/main/ai/remote/server-sessions';
import { composeIpc } from '../../src/main/composition/compose-ipc';
import { systemClock } from '../../src/main/infra/system-clock';
import { EncryptedFileSecretStore } from '../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../src/main/secure/namespaced-secret-store';
import type { SecretStore } from '../../src/main/secure/secret-store';
import { AesTestCipher } from './support/aes-test-cipher';
import { startStubRelayServer, type StubRelayServer } from './support/stub-relay-server';
import { createTempDir, type TempDir } from './support/temp-dir';

const APP = {
  name: 'Relay',
  version: '0.0.0-test',
  isPackaged: false,
  platform: 'linux' as const,
  electronVersion: 'test',
};

describe('main process server session (single token owner)', () => {
  let dir: TempDir;
  let server: StubRelayServer;
  let secrets: SecretStore;

  beforeEach(async () => {
    dir = await createTempDir();
    server = await startStubRelayServer();
    secrets = new NamespacedSecretStore(
      new EncryptedFileSecretStore(dir.file('secrets.bin'), new AesTestCipher()),
      'renderer',
    );
  });

  afterEach(async () => {
    await server.close();
    await dir.remove();
  });

  const key = (): string => sessionSecretKey(server.url);

  const store = async (tokens: TokenPair): Promise<void> => {
    await secrets.set(key(), JSON.stringify(tokens));
  };

  const stored = async (): Promise<unknown> => {
    const raw = await secrets.get(key());
    return raw === null ? null : JSON.parse(raw);
  };

  const sessions = (fetch?: FetchLike): ServerSessions =>
    new ServerSessions({ secrets, clock: systemClock, fetch });

  const refreshCalls = (): number =>
    server.calls.filter((call) => call === 'POST /auth/refresh').length;

  const rendererAccess = async (
    owner: ServerSessions,
    rejected?: string,
  ): Promise<SessionAccess> => {
    const router = composeIpc({ app: APP, sessions: owner }).invoke;
    const result = await router.dispatch({
      channel: 'session.getAccessToken',
      input: { serverUrl: `${server.url}/`, ...(rejected === undefined ? {} : { rejected }) },
    });
    expect(result.ok).toBe(true);
    return (result.ok ? result.data : null) as SessionAccess;
  };

  it('returns a valid stored token without refreshing', async () => {
    await store(server.tokens);

    expect(await sessions().get(server.url).accessToken()).toBe(server.tokens.accessToken);
    expect(refreshCalls()).toBe(0);
  });

  it('refreshes once when the renderer and the worker ask at the same time', async () => {
    const expiring = server.issueTokens(31_000);
    await store(expiring);
    const owner = sessions();
    const worker = owner.get(server.url);

    const [fromRenderer, fromWorker, again] = await Promise.all([
      rendererAccess(owner),
      worker.accessToken(),
      rendererAccess(owner),
    ]);

    expect(refreshCalls()).toBe(1);
    expect(fromRenderer).toEqual({ accessToken: server.tokens.accessToken, expired: false });
    expect(fromWorker).toBe(server.tokens.accessToken);
    expect(again.accessToken).toBe(server.tokens.accessToken);
    expect(server.tokens.accessToken).not.toBe(expiring.accessToken);
    expect(await stored()).toEqual(server.tokens);
  });

  it('refreshes once for concurrent 401s and hands out the rotated token afterwards', async () => {
    const current = server.issueTokens(15 * 60_000);
    await store(current);
    const owner = sessions();

    const [first, fromWorker, second] = await Promise.all([
      rendererAccess(owner, current.accessToken),
      owner.get(server.url).renewAfterRejection(current.accessToken),
      rendererAccess(owner, current.accessToken),
    ]);

    expect(refreshCalls()).toBe(1);
    expect([first.accessToken, fromWorker, second.accessToken]).toEqual([
      server.tokens.accessToken,
      server.tokens.accessToken,
      server.tokens.accessToken,
    ]);
    expect(await rendererAccess(owner, current.accessToken)).toEqual({
      accessToken: server.tokens.accessToken,
      expired: false,
    });
    expect(refreshCalls()).toBe(1);
  });

  it('clears the session and reports it expired when the server rejects the refresh', async () => {
    await store({ ...server.issueTokens(10_000), refreshToken: 'refresh-revoked' });

    expect(await rendererAccess(sessions())).toEqual({ accessToken: null, expired: true });
    expect(await stored()).toBeNull();
  });

  it('still reports the session expired to the renderer after the worker hit the rejection', async () => {
    await store({ ...server.issueTokens(10_000), refreshToken: 'refresh-revoked' });
    const owner = sessions();

    expect(await owner.get(server.url).accessToken()).toBeNull();
    expect(await stored()).toBeNull();
    expect(await rendererAccess(owner)).toEqual({ accessToken: null, expired: true });
    expect(await rendererAccess(owner, 'stale-token')).toEqual({
      accessToken: null,
      expired: true,
    });

    await owner.get(server.url).save(server.issueTokens(15 * 60_000));
    expect(await rendererAccess(owner)).toEqual({
      accessToken: server.tokens.accessToken,
      expired: false,
    });
    await owner.get(server.url).clear();
    expect(await rendererAccess(owner)).toEqual({ accessToken: null, expired: false });
  });

  it('keeps the session and the still-valid token while the server is unreachable', async () => {
    const expiring = server.issueTokens(20_000);
    await store(expiring);
    const offline: FetchLike = () => Promise.reject(new Error('offline'));

    expect(await rendererAccess(sessions(offline))).toEqual({
      accessToken: expiring.accessToken,
      expired: false,
    });
    expect(await stored()).toEqual(expiring);
  });

  it('stores logins and logouts through the same queue as the refresh', async () => {
    let logout: Promise<unknown> = Promise.resolve();
    const loggingOutDuringRefresh: FetchLike = (input, init) => {
      logout = router.dispatch({ channel: 'session.clear', input: { serverUrl: server.url } });
      return fetch(input, init);
    };
    const owner = sessions(loggingOutDuringRefresh);
    const router = composeIpc({ app: APP, sessions: owner }).invoke;
    await store(server.issueTokens(10_000));

    const access = await owner.get(server.url).access();

    expect(access.accessToken).toBe(server.tokens.accessToken);
    expect(await logout).toEqual({ ok: true, data: { ok: true } });
    expect(await stored()).toBeNull();
    expect(
      await router.dispatch({ channel: 'session.hasTokens', input: { serverUrl: server.url } }),
    ).toEqual({ ok: true, data: { signedIn: false } });

    const login = server.issueTokens(15 * 60_000);
    await router.dispatch({
      channel: 'session.setTokens',
      input: { serverUrl: server.url, tokens: login },
    });
    expect(await stored()).toEqual(login);
    expect(await owner.get(server.url).accessToken()).toBe(login.accessToken);
    expect(refreshCalls()).toBe(1);
  });

  it('does not resurrect a session that was removed while a refresh was running', async () => {
    await store(server.issueTokens(10_000));
    const loggingOut: FetchLike = async (input, init) => {
      await secrets.delete(key());
      return fetch(input, init);
    };

    expect(await sessions(loggingOut).get(server.url).accessToken()).toBeNull();
    expect(refreshCalls()).toBe(1);
    expect(await stored()).toBeNull();
  });
});
