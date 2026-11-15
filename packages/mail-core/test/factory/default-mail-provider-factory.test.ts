import type { GreenMailUser } from '@relay/config/test-infra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DefaultMailProviderFactory,
  GoogleOAuthTokenRefresher,
  RefreshingOAuthTokenProvider,
} from '../../src';
import { buildAccount } from '../support/accounts';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { startGoogleTokenStub, type GoogleTokenStub } from '../support/google-token-stub';
import { FixedClock, InMemoryCredentialVault } from '../support/infrastructure';

const NOW = new Date('2026-11-15T10:00:00.000Z');

describe('DefaultMailProviderFactory with XOAUTH2', () => {
  let user: GreenMailUser;
  let stub: GoogleTokenStub;

  beforeEach(async () => {
    user = await createGreenMailUser();
    stub = await startGoogleTokenStub();
  });

  afterEach(async () => {
    await stub.close();
    await deleteGreenMailUser(user);
  });

  it('refreshes an expired Gmail token and connects over XOAUTH2', async () => {
    stub.respondWith({
      status: 200,
      body: { access_token: 'fresh-token', expires_in: 3600, token_type: 'Bearer' },
    });
    const vault = new InMemoryCredentialVault();
    const clock = new FixedClock(NOW);
    const factory = new DefaultMailProviderFactory({
      allowPlaintext: true,
      tokens: new RefreshingOAuthTokenProvider({
        refreshers: {
          gmail: new GoogleOAuthTokenRefresher(
            { clientId: 'id', clientSecret: null, tokenEndpoint: stub.url },
            clock,
          ),
        },
        vault,
        clock,
      }),
    });
    const account = buildAccount(user, { provider: 'gmail' });

    const provider = factory.create(account, {
      kind: 'oauth',
      provider: 'gmail',
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: '2026-11-15T09:00:00.000Z',
      scope: 'https://mail.google.com/',
    });
    await provider.connect();
    const mailboxes = await provider.listMailboxes();
    await provider.close();

    expect(mailboxes.map((mailbox) => mailbox.role)).toEqual(['inbox']);
    expect(stub.requests.map((request) => request.get('refresh_token'))).toEqual(['refresh-token']);
    expect(vault.entries.get(account.id)).toMatchObject({ accessToken: 'fresh-token' });
  });
});
