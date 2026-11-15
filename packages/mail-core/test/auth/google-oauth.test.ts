import { ProviderError } from '@relay/engine';
import type { AccountId, OAuthCredentials } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildGoogleAuthUrl,
  createPkceChallenge,
  createPkcePair,
  exchangeGoogleCode,
  GoogleOAuthTokenRefresher,
  RefreshingOAuthTokenProvider,
} from '../../src';
import { FixedClock, InMemoryCredentialVault } from '../support/infrastructure';
import {
  fakeIdToken,
  startGoogleTokenStub,
  type GoogleTokenStub,
} from '../support/google-token-stub';
import { buildAccount } from '../support/accounts';

const NOW = new Date('2026-11-15T10:00:00.000Z');

describe('Google OAuth helpers', () => {
  let stub: GoogleTokenStub;

  beforeEach(async () => {
    stub = await startGoogleTokenStub();
  });

  afterEach(async () => {
    await stub.close();
  });

  const config = () => ({
    clientId: 'client-123',
    clientSecret: 'secret-456',
    tokenEndpoint: stub.url,
  });

  it('creates an RFC 7636 S256 PKCE pair', () => {
    const pair = createPkcePair();

    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.codeChallenge).toBe(createPkceChallenge(pair.codeVerifier));
    expect(createPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('builds the consent URL with Gmail scopes and PKCE', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:53111/callback',
        codeChallenge: 'challenge',
        state: 'state-1',
        loginHint: 'matus@gmail.com',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-123',
      redirect_uri: 'http://127.0.0.1:53111/callback',
      response_type: 'code',
      scope: 'https://mail.google.com/ openid email',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      state: 'state-1',
      access_type: 'offline',
      prompt: 'consent',
      login_hint: 'matus@gmail.com',
    });
  });

  it('exchanges an authorization code for OAuth credentials', async () => {
    stub.respondWith({
      status: 200,
      body: {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3599,
        token_type: 'Bearer',
        scope: 'https://mail.google.com/ openid email',
        id_token: fakeIdToken({ email: 'matus@gmail.com', email_verified: true }),
      },
    });

    const result = await exchangeGoogleCode({
      config: config(),
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:53111/callback',
      now: NOW,
    });

    expect(result).toEqual({
      email: 'matus@gmail.com',
      credentials: {
        kind: 'oauth',
        provider: 'gmail',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: '2026-11-15T10:59:59.000Z',
        scope: 'https://mail.google.com/ openid email',
      },
    });
    expect(Object.fromEntries(stub.requests[0] ?? [])).toEqual({
      client_id: 'client-123',
      client_secret: 'secret-456',
      grant_type: 'authorization_code',
      code: 'code-1',
      code_verifier: 'verifier-1',
      redirect_uri: 'http://127.0.0.1:53111/callback',
    });
  });

  it('rejects token errors and malformed responses with ProviderError', async () => {
    const input = {
      config: config(),
      code: 'c',
      codeVerifier: 'v',
      redirectUri: 'http://127.0.0.1/cb',
    };

    stub.respondWith({ status: 400, body: { error: 'invalid_grant' } });
    await expect(exchangeGoogleCode(input)).rejects.toThrow(/invalid_grant/);

    stub.respondWith({ status: 200, body: { access_token: 'x' } });
    await expect(exchangeGoogleCode(input)).rejects.toBeInstanceOf(ProviderError);

    stub.respondWith({
      status: 200,
      body: { access_token: 'x', expires_in: 10, token_type: 'Bearer' },
    });
    await expect(exchangeGoogleCode(input)).rejects.toThrow(/refresh token/);
  });

  it('refreshes credentials and keeps the refresh token when Google omits it', async () => {
    stub.respondWith({
      status: 200,
      body: { access_token: 'access-2', expires_in: 3600, token_type: 'Bearer' },
    });
    const refresher = new GoogleOAuthTokenRefresher(
      { ...config(), clientSecret: null },
      new FixedClock(NOW),
    );
    const credentials: OAuthCredentials = {
      kind: 'oauth',
      provider: 'gmail',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-11-15T09:00:00.000Z',
      scope: 'https://mail.google.com/',
    };

    expect(await refresher.refresh(credentials)).toEqual({
      ...credentials,
      accessToken: 'access-2',
      expiresAt: '2026-11-15T11:00:00.000Z',
    });
    expect(Object.fromEntries(stub.requests[0] ?? [])).toEqual({
      client_id: 'client-123',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    });
  });

  describe('RefreshingOAuthTokenProvider', () => {
    const account = buildAccount(
      { email: 'matus@gmail.com', login: 'matus@gmail.com', password: 'unused' },
      { id: 'acc_gmail' as AccountId, provider: 'gmail' },
    );
    const base: OAuthCredentials = {
      kind: 'oauth',
      provider: 'gmail',
      accessToken: 'stored',
      refreshToken: 'refresh-1',
      expiresAt: '2026-11-15T10:30:00.000Z',
      scope: null,
    };

    const createProvider = (vault: InMemoryCredentialVault) =>
      new RefreshingOAuthTokenProvider({
        refreshers: { gmail: new GoogleOAuthTokenRefresher(config(), new FixedClock(NOW)) },
        vault,
        clock: new FixedClock(NOW),
      });

    it('returns a valid stored token without calling Google', async () => {
      const provider = createProvider(new InMemoryCredentialVault());

      expect(await provider.getAccessToken(account, base)).toBe('stored');
      expect(stub.requests).toHaveLength(0);
    });

    it('refreshes an expiring token once for concurrent callers and stores it in the vault', async () => {
      stub.respondWith({
        status: 200,
        body: { access_token: 'fresh', expires_in: 3600, token_type: 'Bearer' },
      });
      const vault = new InMemoryCredentialVault();
      const provider = createProvider(vault);
      const expiring = { ...base, expiresAt: '2026-11-15T10:00:30.000Z' };
      vault.entries.set(account.id, expiring);

      const tokens = await Promise.all([
        provider.getAccessToken(account, expiring),
        provider.getAccessToken(account, expiring),
      ]);

      expect(tokens).toEqual(['fresh', 'fresh']);
      expect(stub.requests).toHaveLength(1);
      expect(vault.entries.get(account.id)).toMatchObject({
        accessToken: 'fresh',
        refreshToken: 'refresh-1',
      });
      expect(await provider.getAccessToken(account, expiring)).toBe('fresh');
      expect(stub.requests).toHaveLength(1);
    });

    it('fails with ProviderError when no refresher exists for the provider', async () => {
      const provider = new RefreshingOAuthTokenProvider({
        refreshers: {},
        vault: new InMemoryCredentialVault(),
        clock: new FixedClock(NOW),
      });

      await expect(
        provider.getAccessToken(account, {
          ...base,
          provider: 'outlook',
          expiresAt: '2026-11-15T09:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(ProviderError);
    });
  });
});
