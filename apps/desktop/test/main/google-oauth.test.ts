import { writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { createPkceChallenge, exchangeGoogleCode } from '@relay/mail-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGoogleClientConfigSource } from '../../src/main/oauth/create-google-client-config-source';
import { GoogleLoopbackFlow } from '../../src/main/oauth/google-loopback-flow';
import { GoogleOAuthCoordinator } from '../../src/main/oauth/google-oauth-coordinator';
import { startStubGoogleTokenEndpoint, StubBrowser, type StubGoogle } from './support/stub-google';
import { createTempDir, type TempDir } from './support/temp-dir';

class StubMalformedCaller {
  async open(url: string): Promise<void> {
    const redirect = new URL(new URL(url).searchParams.get('redirect_uri') ?? '');
    const status = await new Promise<string>((resolve) => {
      const socket = connect(Number(redirect.port), '127.0.0.1', () => {
        socket.write('GET //[ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
      });
      socket.on('data', (chunk: Buffer) => {
        resolve(chunk.toString('utf8').split('\r\n')[0] ?? '');
        socket.destroy();
      });
    });
    expect(status).toContain('400');
  }
}

describe('Google OAuth loopback flow', () => {
  let dir: TempDir;
  let google: StubGoogle;

  beforeEach(async () => {
    dir = await createTempDir();
    google = await startStubGoogleTokenEndpoint('jana@gmail.com');
  });

  afterEach(async () => {
    await google.close();
    await dir.remove();
  });

  const configSource = () =>
    createGoogleClientConfigSource({
      env: { RELAY_GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com' },
      baked: { clientId: undefined, clientSecret: undefined },
      filePath: dir.file('google-oauth.json'),
    });

  it('receives the code on 127.0.0.1 with PKCE and exchanges it at the token endpoint', async () => {
    const browser = new StubBrowser('approve');
    const flow = new GoogleLoopbackFlow(configSource(), browser);
    const { grant, config } = await flow.authorize({ loginHint: 'jana@gmail.com' });

    const [authUrl] = browser.opened;
    expect(authUrl?.origin).toBe('https://accounts.google.com');
    expect(authUrl?.searchParams.get('client_id')).toBe('client-123.apps.googleusercontent.com');
    expect(authUrl?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl?.searchParams.get('code_challenge')).toBe(
      createPkceChallenge(grant.codeVerifier),
    );
    expect(authUrl?.searchParams.get('login_hint')).toBe('jana@gmail.com');
    expect(grant.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
    expect(authUrl?.searchParams.get('redirect_uri')).toBe(grant.redirectUri);
    expect(grant.code).toBe('auth-code-1');
    expect(browser.callbackStatuses).toEqual([200]);

    const exchanged = await exchangeGoogleCode({
      config: { ...config, tokenEndpoint: google.tokenEndpoint },
      code: grant.code,
      codeVerifier: grant.codeVerifier,
      redirectUri: grant.redirectUri,
    });
    expect(exchanged.email).toBe('jana@gmail.com');
    expect(exchanged.credentials.refreshToken).toBe('refresh-1');
    expect(google.tokenRequests[0]?.get('redirect_uri')).toBe(grant.redirectUri);
    await expect(fetch(grant.redirectUri)).rejects.toThrow();
  });

  it('ignores callbacks with a wrong state and keeps waiting for the real one', async () => {
    const browser = new StubBrowser('tamper-state');
    const flow = new GoogleLoopbackFlow(configSource(), browser, 200);
    await expect(flow.authorize()).rejects.toMatchObject({
      message: 'Prihlásenie cez Google vypršalo',
    });
    expect(browser.callbackStatuses).toEqual([400]);
  });

  it('answers malformed requests on the loopback port without crashing', async () => {
    const flow = new GoogleLoopbackFlow(configSource(), new StubMalformedCaller(), 200);
    await expect(flow.authorize()).rejects.toMatchObject({
      message: 'Prihlásenie cez Google vypršalo',
    });
  });

  it('reports a denied consent', async () => {
    const flow = new GoogleLoopbackFlow(configSource(), new StubBrowser('deny'));
    await expect(flow.authorize()).rejects.toMatchObject({
      message: 'Google odmietol prihlásenie (access_denied)',
    });
  });

  it('times out when the browser never comes back and can be cancelled', async () => {
    const timedOut = new GoogleLoopbackFlow(configSource(), new StubBrowser('ignore'), 50);
    await expect(timedOut.authorize()).rejects.toMatchObject({
      message: 'Prihlásenie cez Google vypršalo',
    });
    const coordinator = new GoogleOAuthCoordinator(
      new GoogleLoopbackFlow(configSource(), new StubBrowser('ignore')),
      { connect: () => Promise.reject(new Error('not used')) },
    );
    const pending = coordinator.authorize({ mode: 'synced' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    coordinator.cancel();
    await expect(pending).rejects.toMatchObject({
      message: 'Prihlásenie cez Google bolo zrušené',
    });
  });

  it('waits on shutdown for an account connection of a replaced authorization', async () => {
    let finishFirst: (error: Error) => void = () => undefined;
    let connections = 0;
    const coordinator = new GoogleOAuthCoordinator(
      new GoogleLoopbackFlow(configSource(), new StubBrowser('approve')),
      {
        connect: () => {
          connections += 1;
          if (connections > 1) {
            return Promise.reject(new Error('second connection failed'));
          }
          return new Promise((_resolve, reject) => {
            finishFirst = reject;
          });
        },
      },
    );
    const first = coordinator.authorize({ mode: 'local' });
    await expect.poll(() => connections).toBe(1);
    const second = coordinator.authorize({ mode: 'local' });
    await expect(second).rejects.toThrow('second connection failed');

    let shutDown = false;
    const shuttingDown = coordinator.shutdown().then(() => {
      shutDown = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shutDown).toBe(false);
    finishFirst(new Error('first connection aborted'));
    await expect(first).rejects.toThrow('first connection aborted');
    await shuttingDown;
    expect(shutDown).toBe(true);
  });

  it('returns the grant to the renderer in synced mode', async () => {
    const coordinator = new GoogleOAuthCoordinator(
      new GoogleLoopbackFlow(configSource(), new StubBrowser('approve')),
      { connect: () => Promise.reject(new Error('not used')) },
    );
    const result = await coordinator.authorize({ mode: 'synced' });
    expect(result.mode).toBe('synced');
    expect(result.mode === 'synced' && result.grant.code).toBe('auth-code-1');
  });

  it('explains how to configure the client id when it is missing', async () => {
    const missing = createGoogleClientConfigSource({
      env: {},
      baked: { clientId: undefined, clientSecret: undefined },
      filePath: dir.file('google-oauth.json'),
    });
    const file = dir.file('google-oauth.json');
    await expect(missing.load()).rejects.toMatchObject({
      code: 'validation_failed',
      message: expect.stringContaining('RELAY_GOOGLE_CLIENT_ID') as unknown,
    });
    await expect(missing.load()).rejects.toMatchObject({
      message: expect.stringContaining(`vytvor súbor ${file}`) as unknown,
    });
    await writeFile(file, '{ "clientSecret": "secret" }');
    await expect(missing.load()).rejects.toMatchObject({
      code: 'validation_failed',
      message: expect.stringContaining(`Súbor ${file}`) as unknown,
    });
    await writeFile(
      dir.file('google-oauth.json'),
      JSON.stringify({ clientId: 'from-file', clientSecret: 'secret' }),
    );
    expect(await missing.load()).toEqual({ clientId: 'from-file', clientSecret: 'secret' });
  });
});
