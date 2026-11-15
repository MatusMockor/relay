import { ProviderError } from '@relay/engine';
import type { AccountId, OAuthCredentials } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GoogleOAuthTokenRefresher,
  type OAuthTokenRefresher,
  RefreshingOAuthTokenProvider,
} from '../../src';
import { buildAccount } from '../support/accounts';
import { startGoogleTokenStub, type GoogleTokenStub } from '../support/google-token-stub';
import { FixedClock, InMemoryCredentialVault } from '../support/infrastructure';

const NOW = new Date('2026-11-15T10:00:00.000Z');

class InterleavingRefresher implements OAuthTokenRefresher {
  constructor(
    private readonly inner: OAuthTokenRefresher,
    private readonly meanwhile: () => Promise<void>,
  ) {}

  async refresh(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const refreshed = await this.inner.refresh(credentials);
    await this.meanwhile();
    return refreshed;
  }
}

describe('RefreshingOAuthTokenProvider with concurrent credential changes', () => {
  const account = buildAccount(
    { email: 'matus@gmail.com', login: 'matus@gmail.com', password: 'unused' },
    { id: 'acc_gmail' as AccountId, provider: 'gmail' },
  );
  const expiring: OAuthCredentials = {
    kind: 'oauth',
    provider: 'gmail',
    accessToken: 'stored',
    refreshToken: 'refresh-1',
    expiresAt: '2026-11-15T10:00:30.000Z',
    scope: null,
  };
  let stub: GoogleTokenStub;
  let vault: InMemoryCredentialVault;

  beforeEach(async () => {
    stub = await startGoogleTokenStub();
    stub.respondWith({
      status: 200,
      body: { access_token: 'fresh', expires_in: 3600, token_type: 'Bearer' },
    });
    vault = new InMemoryCredentialVault();
    vault.entries.set(account.id, expiring);
  });

  afterEach(async () => {
    await stub.close();
  });

  const providerWhere = (meanwhile: () => Promise<void>) =>
    new RefreshingOAuthTokenProvider({
      refreshers: {
        gmail: new InterleavingRefresher(
          new GoogleOAuthTokenRefresher(
            { clientId: 'client-123', clientSecret: 'secret-456', tokenEndpoint: stub.url },
            new FixedClock(NOW),
          ),
          meanwhile,
        ),
      },
      vault,
      clock: new FixedClock(NOW),
    });

  it('does not resurrect credentials of an account deleted during the refresh', async () => {
    const provider = providerWhere(() => vault.delete(account.id));

    await expect(provider.getAccessToken(account, expiring)).rejects.toBeInstanceOf(ProviderError);
    expect(stub.requests).toHaveLength(1);
    expect(vault.entries.has(account.id)).toBe(false);
  });

  it('keeps a newer grant stored during the refresh and uses it', async () => {
    const reauthorized: OAuthCredentials = {
      ...expiring,
      accessToken: 'reauthorized',
      refreshToken: 'refresh-2',
      expiresAt: '2026-11-15T11:00:00.000Z',
    };
    const provider = providerWhere(() => vault.set(account.id, reauthorized));

    expect(await provider.getAccessToken(account, expiring)).toBe('reauthorized');
    expect(vault.entries.get(account.id)).toEqual(reauthorized);
  });

  it('refreshes an expired replacement stored during the refresh instead of returning it', async () => {
    const replacedButExpired: OAuthCredentials = {
      ...expiring,
      accessToken: 'replaced-expired',
      refreshToken: 'refresh-2',
      expiresAt: '2026-11-15T09:00:00.000Z',
    };
    let replaced = false;
    const provider = providerWhere(async () => {
      if (replaced) {
        return;
      }
      replaced = true;
      await vault.set(account.id, replacedButExpired);
    });

    expect(await provider.getAccessToken(account, expiring)).toBe('fresh');
    expect(stub.requests.map((request) => request.get('refresh_token'))).toEqual([
      'refresh-1',
      'refresh-2',
    ]);
    expect(vault.entries.get(account.id)).toMatchObject({
      accessToken: 'fresh',
      refreshToken: 'refresh-2',
    });
  });

  it('gives up when every refresh races with another expired replacement', async () => {
    let generation = 0;
    const provider = providerWhere(async () => {
      generation += 1;
      await vault.set(account.id, {
        ...expiring,
        refreshToken: `refresh-race-${String(generation)}`,
        expiresAt: '2026-11-15T09:00:00.000Z',
      });
    });

    await expect(provider.getAccessToken(account, expiring)).rejects.toThrow(
      /kept changing to expired ones/,
    );
    expect(stub.requests).toHaveLength(3);
  });

  it('stores the refreshed credentials when nothing changed meanwhile', async () => {
    const provider = providerWhere(() => Promise.resolve());

    expect(await provider.getAccessToken(account, expiring)).toBe('fresh');
    expect(vault.entries.get(account.id)).toMatchObject({
      accessToken: 'fresh',
      refreshToken: 'refresh-1',
    });
  });
});
