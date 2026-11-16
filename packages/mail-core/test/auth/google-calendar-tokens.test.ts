import { ProviderError, ReauthorizationRequiredError } from '@relay/engine';
import type { AccountCredentials, CalendarConnectionId } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildGoogleAuthUrl,
  GoogleCalendarAccessTokens,
  GoogleOAuthTokenRefresher,
  googleScopesFor,
  type KeyedCredentialStore,
} from '../../src';
import { startGoogleTokenStub, type GoogleTokenStub } from '../support/google-token-stub';
import { FixedClock } from '../support/infrastructure';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const CONNECTION = 'ccn_1' as CalendarConnectionId;

class MapStore implements KeyedCredentialStore<CalendarConnectionId> {
  readonly entries = new Map<CalendarConnectionId, AccountCredentials>();

  get(key: CalendarConnectionId): Promise<AccountCredentials | null> {
    return Promise.resolve(this.entries.get(key) ?? null);
  }

  setIfUnchanged(
    key: CalendarConnectionId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    if (JSON.stringify(this.entries.get(key)) !== JSON.stringify(expected)) {
      return Promise.resolve(false);
    }
    this.entries.set(key, next);
    return Promise.resolve(true);
  }
}

const credentials = (expiresAt: string): AccountCredentials => ({
  kind: 'oauth',
  provider: 'gmail',
  accessToken: 'old-access',
  refreshToken: 'refresh-1',
  expiresAt,
  scope: 'openid email https://www.googleapis.com/auth/calendar.events',
});

describe('Google calendar OAuth', () => {
  let stub: GoogleTokenStub;
  let store: MapStore;
  let tokens: GoogleCalendarAccessTokens;

  beforeEach(async () => {
    stub = await startGoogleTokenStub();
    store = new MapStore();
    const clock = new FixedClock(NOW);
    const refresher = new GoogleOAuthTokenRefresher(
      { clientId: 'client-1', clientSecret: null, tokenEndpoint: stub.url },
      clock,
    );
    tokens = new GoogleCalendarAccessTokens({ refresher, store, clock });
  });

  afterEach(async () => {
    await stub.close();
  });

  it('requests calendar scopes alone or together with Gmail, with incremental consent', () => {
    expect(googleScopesFor({ mail: false, calendar: true })).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    ]);
    expect(googleScopesFor({ mail: true, calendar: true })[0]).toBe('https://mail.google.com/');
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1:5000/oauth/callback',
        codeChallenge: 'challenge',
        state: 'state',
        scopes: googleScopesFor({ mail: false, calendar: true }),
        includeGrantedScopes: true,
      }),
    );
    expect(url.searchParams.get('scope')).toContain('calendar.events');
    expect(url.searchParams.get('scope')).not.toContain('mail.google.com');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
  });

  it('returns a valid stored token without refreshing', async () => {
    store.entries.set(CONNECTION, credentials('2026-11-15T11:00:00.000Z'));

    expect(await tokens.accessToken(CONNECTION)).toBe('old-access');
    expect(stub.requests).toHaveLength(0);
  });

  it('refreshes an expired token once and stores it', async () => {
    store.entries.set(CONNECTION, credentials('2026-11-15T09:00:00.000Z'));
    stub.respondWith({
      status: 200,
      body: { access_token: 'new-access', expires_in: 3600, token_type: 'Bearer' },
    });

    const [first, second] = await Promise.all([
      tokens.accessToken(CONNECTION),
      tokens.accessToken(CONNECTION),
    ]);

    expect([first, second]).toEqual(['new-access', 'new-access']);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.get('refresh_token')).toBe('refresh-1');
    expect(store.entries.get(CONNECTION)).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'refresh-1',
      expiresAt: '2026-11-15T11:00:00.000Z',
    });
  });

  it('asks for reauthorization when Google rejects the refresh token', async () => {
    store.entries.set(CONNECTION, credentials('2026-11-15T09:00:00.000Z'));
    stub.respondWith({ status: 400, body: { error: 'invalid_grant' } });

    await expect(tokens.accessToken(CONNECTION)).rejects.toBeInstanceOf(
      ReauthorizationRequiredError,
    );
    await expect(tokens.accessToken('ccn_missing' as CalendarConnectionId)).rejects.toBeInstanceOf(
      ReauthorizationRequiredError,
    );
  });

  it('keeps transient token endpoint failures as provider errors', async () => {
    store.entries.set(CONNECTION, credentials('2026-11-15T09:00:00.000Z'));
    stub.respondWith({ status: 503, body: { error: 'backend_error' } });

    const failure = await tokens.accessToken(CONNECTION).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).not.toBeInstanceOf(ReauthorizationRequiredError);
  });
});
